package tz.co.folenichap.analytics;

import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tz.co.folenichap.security.AuthPrincipal;
import tz.co.folenichap.security.CurrentUser;

import java.time.LocalDate;

@RestController
@RequestMapping("/api/v1/admin/analytics")
@RequiredArgsConstructor
public class AdminAnalyticsController {

    private final AnalyticsService analytics;

    /** Revenue, wait times, no-show rate, peak hours heatmap, staff and service performance. */
    @GetMapping("/dashboard")
    public AnalyticsService.Dashboard dashboard(@CurrentUser AuthPrincipal user,
                                                @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                                @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return analytics.dashboard(user.requireTenant(), from, to);
    }
}
