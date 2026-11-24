package tz.co.folenichap.queue;

import org.springframework.stereotype.Component;

/**
 * ETA = people ahead x average service duration / number of agents actively serving.
 * Rounded up; minimum 0. Simple, explainable and good enough for a waiting room.
 */
@Component
public class WaitEstimator {

    public int estimateMinutes(long peopleAhead, int avgDurationMinutes, long activeAgents) {
        if (peopleAhead <= 0) {
            return 0;
        }
        long agents = Math.max(1, activeAgents);
        return (int) Math.ceil((double) peopleAhead * avgDurationMinutes / agents);
    }
}
