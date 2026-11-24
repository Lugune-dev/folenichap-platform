package tz.co.folenichap.notification;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import tz.co.folenichap.config.AppProperties;

import java.util.List;
import java.util.Map;

/** Beem Africa SMS (https://apisms.beem.africa/v1/send). */
@Slf4j
@Component
public class BeemSmsClient {

    private final AppProperties.Sms cfg;
    private final RestClient client;

    public BeemSmsClient(AppProperties props, RestClient.Builder builder) {
        this.cfg = props.notification().sms();
        this.client = builder.clone().baseUrl("https://apisms.beem.africa").build();
    }

    public boolean isEnabled() {
        return cfg.enabled() && cfg.beemApiKey() != null && !cfg.beemApiKey().isBlank()
                && cfg.beemSecretKey() != null && !cfg.beemSecretKey().isBlank();
    }

    public ChannelResult send(String to, String text) {
        Map<String, Object> body = Map.of(
                "source_addr", cfg.senderId(),
                "schedule_time", "",
                "encoding", 0,
                "message", text,
                "recipients", List.of(Map.of("recipient_id", 1, "dest_addr", to)));
        try {
            JsonNode res = client.post()
                    .uri("/v1/send")
                    .headers(h -> h.setBasicAuth(cfg.beemApiKey(), cfg.beemSecretKey()))
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(JsonNode.class);
            boolean ok = res != null && res.path("successful").asBoolean(false);
            String requestId = res == null ? null : res.path("request_id").asText(null);
            return ok ? ChannelResult.ok(requestId) : ChannelResult.failed(res == null ? "empty response" : res.toString());
        } catch (Exception e) {
            log.warn("Beem SMS to {} failed: {}", to, e.getMessage());
            return ChannelResult.failed(WhatsAppCloudClient.truncate(e.getMessage()));
        }
    }
}
