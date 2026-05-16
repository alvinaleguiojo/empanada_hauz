"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, Td, Th } from "@/components/ui/table";

export function DeliveryTable({ items }: { items: Array<any> }) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function copyPayload(id: string, payload: string) {
    try {
      await navigator.clipboard.writeText(payload);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 1600);
    } catch {
      setCopiedId(null);
    }
  }

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold">Manual Booking Queue</h3>
        <p className="text-sm text-foreground/55">Maxim queue only</p>
      </div>
      <Table>
        <thead>
          <tr>
            <Th>Customer</Th>
            <Th>Phone</Th>
            <Th>Address</Th>
            <Th>Qty</Th>
            <Th>Total</Th>
            <Th>Schedule</Th>
            <Th>Copy Payload</Th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <Td>{item.customerName}</Td>
              <Td>{item.phoneNumber ?? "N/A"}</Td>
              <Td>{item.address ?? "N/A"}</Td>
              <Td>{item.quantity}</Td>
              <Td>{String(item.totalAmount)}</Td>
              <Td>{item.preferredSchedule ? new Date(item.preferredSchedule).toLocaleString() : "Not scheduled"}</Td>
              <Td className="min-w-[320px]">
                <div className="flex items-center gap-3">
                  <Button
                    variant={copiedId === item.id ? "secondary" : "default"}
                    className="shrink-0"
                    onClick={() => copyPayload(item.id, item.copyDetails)}
                  >
                    {copiedId === item.id ? <Check size={16} /> : <Copy size={16} />}
                    <span className="ml-2">{copiedId === item.id ? "Copied" : "Copy"}</span>
                  </Button>
                  <span className="max-w-[220px] truncate text-xs text-foreground/55">{item.copyDetails}</span>
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}
