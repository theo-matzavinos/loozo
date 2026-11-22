/**
 * Past this many unsent bytes in a channel socket's buffer, the server stops pulling values
 * (one value frame may overshoot it), holds back message grants, and the Node listener stops
 * answering the caller's pings. The call's terminal frame and the listener's own heartbeat ping
 * aren't held back. Internal; its own module so the Node listener reads it without loading the
 * server pipeline.
 */
export const bufferedMark = 1024 * 1024;
