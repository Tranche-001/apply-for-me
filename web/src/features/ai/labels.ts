// How a job is named everywhere: "Company · Role", or just the role when there is no company.
export function jobLabel(job: { company: string; role: string }): string {
  const company = job.company.trim()
  const role = job.role.trim()
  return company ? `${company} · ${role}` : role
}
