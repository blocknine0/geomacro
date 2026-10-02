import { defineEventHandler, sendRedirect } from "h3";

export default defineEventHandler((event) => sendRedirect(event, "/data-api", 308));
