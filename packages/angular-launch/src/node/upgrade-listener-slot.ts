// The process-global slot where createUpgradeHandler stores the listener it creates, latest
// first, and where the serve builder's dev-server middleware finds it. Its own module so the
// builder reads it without loading ws.
export const upgradeListenerSlot = Symbol.for("@loozo/angular-launch/upgrade-listener/v1");
