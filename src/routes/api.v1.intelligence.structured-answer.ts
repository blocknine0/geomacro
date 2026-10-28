import {createFileRoute} from "@tanstack/react-router";
import {paidStructuredAnswerHandlers} from "../lib/paid-structured-answer.server";

/** Fast question-to-exact-SKU entry; all money and evidence stay canonical. */
export const Route=createFileRoute("/api/v1/intelligence/structured-answer")({
  server:{handlers:paidStructuredAnswerHandlers},
});
