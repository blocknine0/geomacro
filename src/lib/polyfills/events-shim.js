import EventsModule from "events/events.js";
export const EventEmitter = EventsModule;
export default EventsModule;
export const once = (emitter, name) => new Promise((resolve, reject) => {
  const handler = (...args) => { emitter.removeListener("error", err); resolve(args); };
  const err = (e) => { emitter.removeListener(name, handler); reject(e); };
  emitter.once(name, handler);
  emitter.once("error", err);
});
