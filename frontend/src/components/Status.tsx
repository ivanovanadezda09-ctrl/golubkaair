
export function Status({error, loading}: {error?: Error | null; loading?: boolean}) {
  return error ? <p className="error" role="alert">{error.message}</p> :
    loading ? <p className="status" role="status">Загрузка данных…</p> : null
}
