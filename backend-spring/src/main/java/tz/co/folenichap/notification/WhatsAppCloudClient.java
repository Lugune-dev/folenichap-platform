package tz.co.folenichap.notification;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import tz.co.folenichap.config.AppProperties;

import java.util.List;
import java.util.Map;

/** Meta WhatsApp Cloud API: sends pre-approved utility templates. */
@Slf4j
@Component
public class WhatsAppCloudClient {

    private final AppProperties.WhatsApp cfg;
    private final RestClient client;

    public WhatsAppCloudClient(AppProperties props, RestClient.Builder builder) {
        this.cfg = props.notification().whatsapp();
        this.client = builder.clone().baseUrl("https://graph.facebook.com").build();
    }

    public boolean isEnabled() {
        return cfg.enabled() && notBlank(cfg.phoneNumberId()) && notBlank(cfg.accessToken());
    }

    public ChannelResult sendTemplate(String to, String templateName, String lang, List<String> params) {
        Map<String, Object> body = Map.of(
                "messaging_product", "whatsapp",
                "to", to,
                "type", "template",
                "template", Map.of(
                        "name", templateName,
                        "language", Map.of("code", "en".equals(lang) ? "en" : "sw"),
                        "components", List.of(Map.of(
                                "type", "body",
                                "parameters", params.stream().map(p -> Map.of("type", "text", "text", p)).toList()))));
        try {
            JsonNode res = client.post()
                    .uri("/{v}/{id}/messages", cfg.apiVersion(), cfg.phoneNumberId())
                    .headers(h -> h.setBearerAuth(cfg.accessToken()))
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(JsonNode.class);
            String id = res != null && res.path("messages").isArray() && !res.path("messages").isEmpty()
                    ? res.path("messages").get(0).path("id").asText(null) : null;
            return ChannelResult.ok(id);
        } catch (Exception e) {
            log.warn("WhatsApp send to {} failed: {}", to, e.getMessage());
            return ChannelResult.failed(truncate(e.getMessage()));
        }
    }

    /** Approved template for a message type, or null when none is configured (SMS is used instead). */
    public String templateName(String key) {
        String name = switch (key) {
            case "BOOKED" -> cfg.templateBooked();
            case "NEAR_TURN" -> cfg.templateNearTurn();
            case "CALLED" -> cfg.templateCalled();
            case "APPOINTMENT_BOOKED" -> cfg.templateAppointmentBooked();
            case "APPOINTMENT_REMINDER" -> cfg.templateAppointmentReminder();
            case "PASSWORD_RESET" -> cfg.templatePasswordReset();
            default -> throw new IllegalArgumentException(key);
        };
        return notBlank(name) ? name : null;
    }

    private static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }

    static String truncate(String s) {
        return s == null ? null : s.length() > 480 ? s.substring(0, 480) : s;
    }
}
