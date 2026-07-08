import { BUILTIN_ROLES, type Role } from '../lib/constants'

interface RoleSelectorProps {
  value: Role | null
  onChange: (r: Role) => void
}

export function RoleSelector({ value, onChange }: RoleSelectorProps) {
  return (
    <div className="role-list">
      {BUILTIN_ROLES.map(r => (
        <label key={r} className={'role-item' + (value === r ? ' selected' : '')}>
          <input type="radio" name="role" checked={value === r} onChange={() => onChange(r)} />
          <span className="role-item-label">{r}</span>
        </label>
      ))}
    </div>
  )
}
