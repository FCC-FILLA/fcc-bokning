import { redirect } from "next/navigation";

// Offerttexterna ligger nu under Inställningar → Offert.
export default function OldQuoteTexts() {
  redirect("/installningar/offert");
}
