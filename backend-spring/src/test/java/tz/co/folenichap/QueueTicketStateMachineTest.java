package tz.co.folenichap;

import org.junit.jupiter.api.Test;
import tz.co.folenichap.common.ApiException;
import tz.co.folenichap.queue.QueueTicket;
import tz.co.folenichap.queue.TicketStatus;
import tz.co.folenichap.queue.WaitEstimator;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class QueueTicketStateMachineTest {

    @Test
    void happyPath() {
        QueueTicket t = new QueueTicket();
        t.setTicketNumber("D-001");
        t.transitionTo(TicketStatus.CALLED);
        t.transitionTo(TicketStatus.CALLED); // recall
        t.transitionTo(TicketStatus.SERVING);
        t.transitionTo(TicketStatus.COMPLETED);
        assertThat(t.getStatus()).isEqualTo(TicketStatus.COMPLETED);
    }

    @Test
    void cannotCompleteFromWaiting() {
        QueueTicket t = new QueueTicket();
        t.setTicketNumber("G-002");
        assertThatThrownBy(() -> t.transitionTo(TicketStatus.COMPLETED)).isInstanceOf(ApiException.class);
    }

    @Test
    void noShowCanBeRequeued() {
        QueueTicket t = new QueueTicket();
        t.setTicketNumber("G-003");
        t.transitionTo(TicketStatus.NO_SHOW);
        t.transitionTo(TicketStatus.WAITING);
        assertThat(t.getStatus()).isEqualTo(TicketStatus.WAITING);
    }

    @Test
    void etaUsesParallelAgents() {
        WaitEstimator e = new WaitEstimator();
        assertThat(e.estimateMinutes(0, 15, 1)).isZero();
        assertThat(e.estimateMinutes(4, 15, 1)).isEqualTo(60);
        assertThat(e.estimateMinutes(4, 15, 3)).isEqualTo(20);
        assertThat(e.estimateMinutes(3, 10, 0)).isEqualTo(30); // no active agent => assume one
    }
}
