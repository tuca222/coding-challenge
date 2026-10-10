import { User } from "../models/User.js";

export async function userExists(userId: string): Promise<boolean> {
  return (await User.exists({ _id: userId })) !== null;
}
