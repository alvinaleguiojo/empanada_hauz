import { Card } from "@/components/ui/card";
import { Table, Td, Th } from "@/components/ui/table";

export function InventoryTable({ items }: { items: Array<any> }) {
  return (
    <Card>
      <h3 className="mb-4 text-lg font-semibold">Ingredient Stock</h3>
      <Table>
        <thead>
          <tr>
            <Th>Item</Th>
            <Th>Stock</Th>
            <Th>Unit</Th>
            <Th>Reorder Level</Th>
            <Th>Days Left</Th>
            <Th>Cost</Th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <Td>{item.displayName}</Td>
              <Td>{String(item.currentStock)}</Td>
              <Td>{item.unit}</Td>
              <Td>{String(item.reorderLevel)}</Td>
              <Td>{item.estimatedDaysLeft ?? "N/A"}</Td>
              <Td>{String(item.costPerUnit)}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}
