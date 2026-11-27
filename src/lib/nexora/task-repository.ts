import type { Task } from "./types"

export interface TaskRepositoryTransaction<T> {
  nextTasks: readonly Task[]
  result: T
}

/**
 * Repository contract backed by Nexora's existing profile state.
 * Implementations must not create another persistent task collection.
 */
export interface TaskRepository {
  getAll(): readonly Task[]
  getById(id: string): Task | undefined
  transact<T>(operation: (current: readonly Task[]) => TaskRepositoryTransaction<T>): T
  replaceAll(tasks: readonly Task[]): void
  save(task: Task): void
  remove(id: string): boolean
}

export class DuplicateTaskIdError extends Error {
  constructor(id: string) {
    super("A task with this ID already exists: " + id)
    this.name = "DuplicateTaskIdError"
  }
}

function assertUniqueTaskIds(tasks: readonly Task[]): void {
  const ids = new Set<string>()
  for (const task of tasks) {
    if (!task.id || ids.has(task.id)) throw new DuplicateTaskIdError(task.id)
    ids.add(task.id)
  }
}

/**
 * Creates a repository adapter over the caller's canonical profile state.
 * The write callback is invoked before a service publishes its domain events.
 */
export function createTaskRepository(
  readTasks: () => readonly Task[],
  writeTasks: (tasks: Task[]) => void,
): TaskRepository {
  const repository: TaskRepository = {
    getAll: () => [...readTasks()],
    getById: (id) => readTasks().find((task) => task.id === id),

    transact: <T>(operation: (current: readonly Task[]) => TaskRepositoryTransaction<T>): T => {
      const current = readTasks()
      const transaction = operation(current)
      if (transaction.nextTasks !== current) {
        const nextTasks = [...transaction.nextTasks]
        assertUniqueTaskIds(nextTasks)
        writeTasks(nextTasks)
      }
      return transaction.result
    },

    replaceAll: (tasks) => {
      const nextTasks = [...tasks]
      assertUniqueTaskIds(nextTasks)
      writeTasks(nextTasks)
    },

    save: (task) => {
      repository.transact((current) => {
        const index = current.findIndex((item) => item.id === task.id)
        const nextTasks = [...current]
        if (index < 0) nextTasks.unshift(task)
        else nextTasks[index] = task
        return { nextTasks, result: undefined }
      })
    },

    remove: (id) => repository.transact((current) => {
      if (!current.some((task) => task.id === id)) return { nextTasks: current, result: false }
      return {
        nextTasks: current.filter((task) => task.id !== id),
        result: true,
      }
    }),
  }

  return repository
}
