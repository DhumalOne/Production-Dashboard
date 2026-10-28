import { redirect } from "next/navigation";

// Open invoices now live on the customer card.
export default async function ReceivableCustomerPage({ params }: PageProps<"/money/receivables/[card]">) {
  redirect(`/customers/${(await params).card}`);
}
