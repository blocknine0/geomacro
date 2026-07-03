// Browser stub for Node's `net` module. ethers imports `connect` for the
// IPC provider, which is unreachable in the browser bundle; the export
// just has to exist so Rollup can resolve it.
export const connect = () => {
  throw new Error("net.connect is not available in the browser");
};
export const createConnection = connect;
export const Socket = class {};
export const Server = class {};
export default { connect, createConnection, Socket, Server };
