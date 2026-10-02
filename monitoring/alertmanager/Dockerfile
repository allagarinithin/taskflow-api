FROM prom/alertmanager:v0.27.0
COPY alertmanager.yml /etc/alertmanager/alertmanager.yml
USER nobody
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1:9093/-/healthy || exit 1
