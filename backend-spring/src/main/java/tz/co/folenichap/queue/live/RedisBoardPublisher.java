package tz.co.folenichap.queue.live;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.listener.ChannelTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import tz.co.folenichap.queue.QueueDtos.BoardSnapshot;

import java.util.Map;
import java.util.UUID;

/**
 * Multi-instance fan-out: publish board snapshots to Redis; every instance (including this one)
 * receives them and pushes to its own SSE subscribers. Enable with FOLENI_SSE_REDIS_RELAY=true.
 */
@Slf4j
@Configuration
@ConditionalOnProperty(name = "foleni.sse.redis-relay", havingValue = "true")
public class RedisBoardPublisher {

    static final String CHANNEL = "foleni:board";

    @Bean
    BoardPublisher redisPublisher(StringRedisTemplate redis, ObjectMapper mapper) {
        return (tenantId, branchId, snapshot) -> {
            try {
                String json = mapper.writeValueAsString(Map.of(
                        "tenantId", tenantId.toString(), "branchId", branchId.toString(), "snapshot", snapshot));
                redis.convertAndSend(CHANNEL, json);
            } catch (Exception e) {
                log.warn("Redis publish failed: {}", e.getMessage());
            }
        };
    }

    @Bean
    RedisMessageListenerContainer boardListenerContainer(RedisConnectionFactory cf, SseBroadcaster broadcaster,
                                                         ObjectMapper mapper) {
        RedisMessageListenerContainer container = new RedisMessageListenerContainer();
        container.setConnectionFactory(cf);
        container.addMessageListener((message, pattern) -> {
            try {
                JsonNode node = mapper.readTree(message.getBody());
                BoardSnapshot snap = mapper.treeToValue(node.get("snapshot"), BoardSnapshot.class);
                broadcaster.broadcastLocal(UUID.fromString(node.get("tenantId").asText()),
                        UUID.fromString(node.get("branchId").asText()), "board", snap);
            } catch (Exception e) {
                log.warn("Redis board message ignored: {}", e.getMessage());
            }
        }, new ChannelTopic(CHANNEL));
        return container;
    }
}
