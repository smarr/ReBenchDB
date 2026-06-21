import { GraphQLClient } from 'graphql-request';

type Fetcher<ValT> = (
  client: GraphQLClient,
  groupPath: string,
  updatedAfter: Date
) => Promise<ValT>;

export class RequestCache<ValT> {
  private value?: ValT;
  private fetchedAt: number;
  private pending?: Promise<ValT>;

  private readonly ttlMs: number;
  private readonly fetcher: Fetcher<ValT>;
  private readonly client: GraphQLClient;

  constructor(
    ttlSeconds: number,
    fetcher: Fetcher<ValT>,
    client: GraphQLClient
  ) {
    this.ttlMs = ttlSeconds * 1000;
    this.fetcher = fetcher;
    this.client = client;
    this.fetchedAt = 0;
  }

  async getCachedValue(groupPath: string, updatedAfter: Date): Promise<ValT> {
    const now = Date.now();

    if (this.value !== undefined && now - this.fetchedAt < this.ttlMs) {
      return this.value;
    }

    if (this.pending) {
      return this.pending;
    }

    const pending = this.fetcher(this.client, groupPath, updatedAfter)
      .then((value) => {
        if (this.pending === pending) {
          this.value = value;
          this.fetchedAt = Date.now();
          this.pending = undefined;
        }
        return value;
      })
      .catch((error) => {
        if (this.pending === pending) {
          this.value = undefined;
          this.fetchedAt = 0;
          this.pending = undefined;
        }
        throw error;
      });
    this.pending = pending;
    return pending;
  }

  clear(): void {
    this.value = undefined;
    this.fetchedAt = 0;
    this.pending = undefined;
  }
}
