package tz.co.folenichap.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.BufferingClientHttpRequestFactory;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.net.http.HttpClient;
import java.time.Duration;

@Configuration
public class HttpClientConfig {

    /** Shared RestClient builder for external integrations (payments, WhatsApp, SMS). */
    @Bean
    public RestClient.Builder integrationRestClientBuilder() {
        HttpClient httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(10))
                .build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(httpClient);
        factory.setReadTimeout(Duration.ofSeconds(30));
        // Buffered so every request carries Content-Length (some gateways mis-read chunked bodies as empty).
        return RestClient.builder().requestFactory(new BufferingClientHttpRequestFactory(factory));
    }
}
