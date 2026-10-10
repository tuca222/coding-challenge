import { Schema, model, type InferSchemaType, type Types } from "mongoose";

const requiredString = { type: String, required: true, trim: true, minlength: 1 };
const nonNegativeInt = {
  type: Number,
  required: true,
  min: 0,
  validate: { validator: Number.isInteger, message: "{PATH} must be an integer" },
};

const inventoryItemSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: requiredString,
    sku: requiredString,
    category: requiredString,
    location: requiredString,
    quantity: nonNegativeInt,
    unitPriceCents: nonNegativeInt,
  },
  { timestamps: true, collection: "inventory" },
);

// Unique SKU per user; also serves every owner query ({ userId } prefix).
inventoryItemSchema.index({ userId: 1, sku: 1 }, { unique: true });

export type InventoryItemDoc = InferSchemaType<typeof inventoryItemSchema> & { _id: Types.ObjectId };

export const InventoryItem = model("InventoryItem", inventoryItemSchema);
