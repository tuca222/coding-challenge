import type { Types } from "mongoose";

export interface UserDto {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export function toUserDto(user: { _id: Types.ObjectId; name: string; email: string; createdAt: Date }): UserDto {
  return {
    id: user._id.toHexString(),
    name: user.name,
    email: user.email,
    createdAt: user.createdAt.toISOString(),
  };
}
