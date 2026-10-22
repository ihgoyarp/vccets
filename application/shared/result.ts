import type { Failure, Success } from '../../domain/types';

export const ok = <T>(data: T): Success<T> => ({ success: true, data });

export const fail = <E>(error: E): Failure<E> => ({ success: false, error });

/**
 * Menjamin exhaustiveness pada switch atas discriminated union:
 * jika varian baru ditambahkan di types tetapi belum ditangani,
 * kompiler akan menolak pemanggilan ini.
 */
export const assertNever = (value: never): never => {
  throw new Error(`Varian tidak tertangani: ${String(value)}`);
};
