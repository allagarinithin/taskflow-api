// =============================================================================
//  TaskFlow API - Jenkins DevOps pipeline (SIT753 7.3HD)
//  Build -> Test -> Code Quality -> Security -> Deploy -> Release -> Monitoring
//  Every stage is a quality gate: a failure stops promotion to the next stage.
// =============================================================================
pipeline {
  agent any

  options {
    timestamps()
    timeout(time: 45, unit: 'MINUTES')
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '25', artifactNumToKeepStr: '10'))
  }

  triggers {
    // Polls GitHub every ~2 minutes; a push automatically starts the pipeline
    pollSCM('H/2 * * * *')
  }

  parameters {
    booleanParam(name: 'REQUIRE_APPROVAL', defaultValue: false,
      description: 'Pause for manual approval before promoting to production')
    booleanParam(name: 'PUSH_GIT_TAG', defaultValue: true,
      description: 'Push a v<version>-build<N> release tag to GitHub (needs github-creds)')
    booleanParam(name: 'SIMULATE_FAILED_DEPLOY', defaultValue: false,
      description: 'Rollback drill: release a misconfigured build to staging and prove automatic rollback')
    booleanParam(name: 'SIMULATE_INCIDENT', defaultValue: false,
      description: 'Incident drill: inject 5xx errors in production and prove the alert fires')
  }

  environment {
    APP_NAME         = 'taskflow-api'
    REGISTRY         = 'localhost:5050'
    IMAGE            = "${REGISTRY}/${APP_NAME}"
    STAGING_URL      = 'http://taskflow-staging:3000'
    PROD_URL         = 'http://taskflow-production:3000'
    PROMETHEUS_URL   = 'http://prometheus:9090'
    ALERTMANAGER_URL = 'http://alertmanager:9093'
    GRAFANA_URL      = 'http://grafana:3000'
    ALERT_WEBHOOK    = 'http://alert-receiver:5001/jenkins'
    TRIVY_CACHE_DIR  = "${JENKINS_HOME}/.cache/trivy"
    NPM_CONFIG_CACHE = "${JENKINS_HOME}/.cache/npm"
    DEPLOY_STATE_DIR = "${JENKINS_HOME}/deploy-state"
  }

  stages {

    // ---------------------------------------------------------------- 1. BUILD
    stage('Build') {
      steps {
        script {
          env.APP_VERSION = sh(script: "node -p \"require('./package.json').version\"", returnStdout: true).trim()
          env.GIT_SHA     = sh(script: 'git rev-parse --short=7 HEAD', returnStdout: true).trim()
          env.IMAGE_TAG   = "${env.APP_VERSION}-${env.BUILD_NUMBER}-${env.GIT_SHA}"
          currentBuild.displayName = "#${env.BUILD_NUMBER} ${env.IMAGE_TAG}"
        }
        sh 'echo "Toolchain: node $(node --version), npm $(npm --version), $(docker --version)"'
        sh 'npm ci --no-audit --no-fund'
        sh '''
          docker build --pull \
            --build-arg APP_VERSION="$IMAGE_TAG" \
            --build-arg GIT_COMMIT="$(git rev-parse HEAD)" \
            --build-arg BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
            -t "$IMAGE:$IMAGE_TAG" .
          docker push "$IMAGE:$IMAGE_TAG"
        '''
        sh '''
          DIGEST=$(docker image inspect --format '{{index .RepoDigests 0}}' "$IMAGE:$IMAGE_TAG")
          SIZE_MB=$(docker image inspect --format '{{.Size}}' "$IMAGE:$IMAGE_TAG" | awk '{printf "%.1f", $1/1048576}')
          jq -n \
            --arg app "$APP_NAME" --arg version "$APP_VERSION" --arg tag "$IMAGE_TAG" \
            --arg image "$IMAGE:$IMAGE_TAG" --arg digest "$DIGEST" --arg size "$SIZE_MB" \
            --arg commit "$(git rev-parse HEAD)" --arg build "$BUILD_NUMBER" --arg url "$BUILD_URL" \
            --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
            '{app:$app, version:$version, imageTag:$tag, image:$image, digest:$digest, sizeMB:$size,
              gitCommit:$commit, buildNumber:$build, buildUrl:$url, builtAt:$at}' > build-info.json
          cat build-info.json
        '''
      }
    }

    // ----------------------------------------------------------------- 2. TEST
    stage('Test') {
      steps {
        // Unit + integration tests; Jest fails the build if coverage drops below thresholds
        sh 'npm run test:ci'
      }
      post {
        always {
          junit allowEmptyResults: true, testResults: 'reports/junit/junit-unit-integration.xml'
          recordCoverage(tools: [[parser: 'COBERTURA', pattern: 'coverage/cobertura-coverage.xml']],
                         sourceCodeRetention: 'EVERY_BUILD')
        }
      }
    }

    // --------------------------------------------------------- 3. CODE QUALITY
    stage('Code Quality') {
      steps {
        sh 'npm run lint'          // custom complexity/maintainability rules (eslint.config.js)
        sh 'npm run lint:report'   // imported into SonarQube as external issues
        withSonarQubeEnv('SonarQube') {
          sh 'sonar-scanner -Dsonar.projectVersion="$APP_VERSION" -Dsonar.analysis.imageTag="$IMAGE_TAG"'
        }
        timeout(time: 5, unit: 'MINUTES') {
          // Blocks the pipeline if the custom "TaskFlow Gate" quality gate fails
          waitForQualityGate abortPipeline: true
        }
      }
    }

    // ------------------------------------------------------------- 4. SECURITY
    stage('Security') {
      steps {
        sh 'mkdir -p reports/security'
        // (a) Dependency audit (SCA) - full report, then gate on HIGH/CRITICAL
        sh 'npm audit --omit=dev --json > reports/security/npm-audit.json || true'
        sh 'npm audit --omit=dev --audit-level=high'
        // (b) Repository scan: vulnerable deps, leaked secrets, Dockerfile misconfigurations
        sh 'trivy fs --scanners vuln,secret,misconfig --skip-dirs node_modules --skip-dirs jenkins --format json -o reports/security/trivy-fs.json .'
        sh 'trivy fs --scanners vuln,secret,misconfig --skip-dirs node_modules --skip-dirs jenkins --severity HIGH,CRITICAL --ignorefile .trivyignore --exit-code 1 .'
        // (c) Container image scan (OS packages + bundled libraries)
        sh 'trivy image --format json -o reports/security/trivy-image.json "$IMAGE:$IMAGE_TAG"'
        sh 'trivy image --severity HIGH,CRITICAL --ignore-unfixed --ignorefile .trivyignore --exit-code 1 "$IMAGE:$IMAGE_TAG"'
      }
      post {
        always {
          sh 'node scripts/security-summary.js reports/security || true'
        }
      }
    }

    // --------------------------------------------------------------- 5. DEPLOY
    stage('Deploy') {
      steps {
        withCredentials([string(credentialsId: 'taskflow-jwt-staging', variable: 'JWT_SECRET'),
                         string(credentialsId: 'taskflow-chaos-token', variable: 'CHAOS_TOKEN')]) {
          script {
            if (params.SIMULATE_FAILED_DEPLOY) {
              sh '''
                echo "=== ROLLBACK DRILL: releasing $IMAGE_TAG with an invalid JWT_SECRET (misconfiguration) ==="
                if JWT_SECRET_OVERRIDE=too-short bash scripts/deploy.sh staging "$IMAGE_TAG"; then
                  echo "Drill failed: the broken release was accepted"; exit 1
                fi
                echo "=== DRILL PASSED: broken release rejected and last known-good version restored ==="
              '''
            }
          }
          sh 'bash scripts/deploy.sh staging "$IMAGE_TAG"'
        }
        // Post-deployment E2E tests against the live staging container
        sh 'EXPECTED_VERSION="$IMAGE_TAG" BASE_URL="$STAGING_URL" npm run test:e2e'
      }
      post {
        always {
          junit allowEmptyResults: true, testResults: 'reports/junit/junit-e2e.xml'
        }
      }
    }

    // -------------------------------------------------------------- 6. RELEASE
    stage('Release') {
      steps {
        script {
          if (params.REQUIRE_APPROVAL) {
            timeout(time: 30, unit: 'MINUTES') {
              input message: "Promote ${env.IMAGE_TAG} to production?", ok: 'Release'
            }
          }
        }
        // Promote the exact image that passed every gate (build once, deploy many)
        sh '''
          docker tag "$IMAGE:$IMAGE_TAG" "$IMAGE:$APP_VERSION"
          docker tag "$IMAGE:$IMAGE_TAG" "$IMAGE:production"
          docker push "$IMAGE:$APP_VERSION"
          docker push "$IMAGE:production"
        '''
        withCredentials([string(credentialsId: 'taskflow-jwt-prod', variable: 'JWT_SECRET'),
                         string(credentialsId: 'taskflow-chaos-token', variable: 'CHAOS_TOKEN')]) {
          sh 'bash scripts/deploy.sh production "$IMAGE_TAG"'
        }
        sh 'bash scripts/smoke-test.sh "$PROD_URL" "$IMAGE_TAG"'
        sh 'bash scripts/release-notes.sh'
        script {
          if (params.PUSH_GIT_TAG) {
            try {
              withCredentials([usernamePassword(credentialsId: 'github-creds',
                                                usernameVariable: 'GIT_USER', passwordVariable: 'GIT_TOKEN')]) {
                sh 'bash scripts/push-git-tag.sh'
              }
            } catch (err) {
              echo "WARNING: release tag not pushed (${err.getMessage()}). The release itself succeeded."
            }
          }
        }
      }
    }

    // ----------------------------------------------------------- 7. MONITORING
    stage('Monitoring') {
      steps {
        // Prometheus + Alertmanager + Grafana + alert receiver, configured as code
        sh 'docker compose -f monitoring/docker-compose.yml up -d --build --remove-orphans'
        sh 'bash scripts/verify-monitoring.sh'
        script {
          if (params.SIMULATE_INCIDENT) {
            withCredentials([string(credentialsId: 'taskflow-chaos-token', variable: 'CHAOS_TOKEN')]) {
              sh 'bash scripts/simulate-incident.sh'
            }
          }
        }
      }
    }
  }

  post {
    always {
      archiveArtifacts allowEmptyArchive: true, fingerprint: true,
        artifacts: 'build-info.json, reports/**/*, coverage/cobertura-coverage.xml'
    }
    success {
      sh 'bash scripts/notify.sh SUCCESS "Released ${IMAGE_TAG:-n/a} to production"'
    }
    unstable {
      sh 'bash scripts/notify.sh UNSTABLE "Build ${IMAGE_TAG:-n/a} finished UNSTABLE"'
    }
    failure {
      sh 'bash scripts/notify.sh FAILURE "Pipeline failed for ${IMAGE_TAG:-n/a} - see console log"'
    }
  }
}
