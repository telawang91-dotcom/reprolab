import { redirect } from "next/navigation";

export default function ReviewRedirect() { redirect("/results?tab=records"); }
