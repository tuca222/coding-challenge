import { MongoMemoryServer } from "mongodb-memory-server";
import type { TestProject } from "vitest/node";

let mongod: MongoMemoryServer | undefined;

export async function setup(project: TestProject): Promise<void> {
  mongod = await MongoMemoryServer.create();
  project.provide("mongoUri", mongod.getUri());
}

export async function teardown(): Promise<void> {
  await mongod?.stop();
}

declare module "vitest" {
  export interface ProvidedContext {
    mongoUri: string;
  }
}
