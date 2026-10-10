export interface SeedItem {
  name: string;
  sku: string;
  category: string;
  location: string;
  quantity: number;
  unitPriceCents: number;
}

export interface SeedUser {
  name: string;
  email: string;
  password: string;
  items: SeedItem[];
}

const item = (
  name: string,
  sku: string,
  category: string,
  location: string,
  quantity: number,
  unitPriceCents: number,
): SeedItem => ({ name, sku, category, location, quantity, unitPriceCents });

export const seedUsers: SeedUser[] = [
  {
    name: "Alice Johnson",
    email: "alice@example.com",
    password: "Alice#2026",
    items: [
      item("Wireless Mouse", "WM-1001", "Electronics", "Warehouse A", 120, 1999),
      item("Mechanical Keyboard", "KB-2002", "Electronics", "Warehouse A", 45, 8950),
      item("USB-C Cable 1m", "UC-3003", "Accessories", "Shelf B2", 300, 549),
      item("27in Monitor", "MN-4004", "Electronics", "Warehouse B", 18, 21999),
      item("Laptop Stand", "LS-5005", "Accessories", "Shelf B3", 0, 3499),
      item("Desk Lamp", "DL-6006", "Furniture", "Warehouse C", 60, 2475),
      item("Office Chair", "OC-7007", "Furniture", "Warehouse C", 12, 15900),
      item("Notebook A5", "NB-8008", "Stationery", "Shelf D1", 500, 299),
      item("Gel Pen Blue", "GP-9009", "Stationery", "Shelf D1", 1000, 125),
      item("Webcam HD", "WC-1010", "Electronics", "Warehouse A", 33, 4999),
    ],
  },
  {
    name: "Bob Smith",
    email: "bob@example.com",
    password: "Bob#2026",
    items: [
      // Same SKU as Alice's mouse: SKUs are unique per user only.
      item("Wireless Mouse", "WM-1001", "Electronics", "Store 1", 25, 2099),
      item("Standing Desk", "SD-2101", "Furniture", "Store 1", 7, 42900),
      item("Headphones", "HP-2202", "Electronics", "Store 2", 0, 7999),
      item("Whiteboard", "WB-2303", "Office", "Store 2", 14, 6450),
      item("Stapler", "ST-2404", "Stationery", "Store 1", 80, 899),
      item("Printer Paper 500", "PP-2505", "Stationery", "Store 3", 200, 749),
      item("Power Strip", "PS-2606", "Accessories", "Store 3", 55, 1599),
      item("HDMI Cable 2m", "HC-2707", "Accessories", "Store 2", 90, 1250),
    ],
  },
  { name: "Carol White", email: "carol@example.com", password: "Carol#2026", items: [] },
];
