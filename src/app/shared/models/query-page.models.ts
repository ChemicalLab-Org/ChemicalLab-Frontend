export interface QueryPage<T> {
  readonly content: T[];
  readonly number: number;
  readonly size: number;
  readonly totalElements: number;
  readonly totalPages: number;
}
