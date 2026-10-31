import { redirect } from "next/navigation";

// Flyttad till Skärmar. Gamla länkar och bokmärken skickas vidare.
export default function Moved() {
  redirect("/skarmar/kontor");
}
