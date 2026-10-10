import { toUserDto } from "../dto/userDto.js";
import type { UserDto } from "../dto/userDto.js";
import { UnauthorizedError } from "../errors/AppError.js";
import { User } from "../models/User.js";

export async function userExists(userId: string): Promise<boolean> {
  return (await User.exists({ _id: userId })) !== null;
}

export async function getProfile(userId: string): Promise<UserDto> {
  const user = await User.findById(userId).lean();
  // The user may be deleted after authenticate ran.
  if (!user) throw new UnauthorizedError();
  return toUserDto(user);
}
