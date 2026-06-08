FROM alpine:3.20

WORKDIR /app

COPY HL-dairy /app/HL-dairy
RUN chmod +x /app/HL-dairy

COPY client.html /app/client.html

RUN mkdir -p /app/diaries

ENV ROCKET_ADDRESS=0.0.0.0
ENV ROCKET_PORT=8000

EXPOSE 8000

VOLUME ["/app/diaries"]

CMD ["/app/HL-dairy"]
