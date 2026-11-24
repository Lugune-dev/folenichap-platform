package tz.co.folenichap.notification;

public record ChannelResult(boolean success, String providerMessageId, String error) {

    public static ChannelResult ok(String id) {
        return new ChannelResult(true, id, null);
    }

    public static ChannelResult failed(String error) {
        return new ChannelResult(false, null, error);
    }
}
