"use client";

interface Requirement {
  label: string;
  test: (p: string) => boolean;
}

const REQUIREMENTS: Requirement[] = [
  { label: "Al menos 8 caracteres", test: (p) => p.length >= 8 },
  { label: "Una letra mayúscula", test: (p) => /[A-Z]/.test(p) },
  { label: "Una letra minúscula", test: (p) => /[a-z]/.test(p) },
  { label: "Un número", test: (p) => /[0-9]/.test(p) },
  {
    label: "Un carácter especial (!@#$%...)",
    test: (p) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(p),
  },
];

const LEVELS = [
  { label: "Muy débil", color: "bg-red-500" },
  { label: "Débil", color: "bg-orange-400" },
  { label: "Regular", color: "bg-yellow-400" },
  { label: "Buena", color: "bg-lime-500" },
  { label: "Fuerte", color: "bg-emerald-500" },
];

interface Props {
  password: string;
}

export function PasswordStrengthBar({ password }: Props) {
  if (!password) return null;

  const passed = REQUIREMENTS.filter((r) => r.test(password)).length;
  const levelIndex = passed === 0 ? 0 : Math.min(passed, LEVELS.length - 1);
  const level = LEVELS[levelIndex];
  const pending = REQUIREMENTS.filter((r) => !r.test(password));

  return (
    <div className="mt-1 space-y-1">
      <div className="flex gap-1">
        {LEVELS.map((l, i) => (
          <div
            key={l.label}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i < passed ? level.color : "bg-gray-200"
            }`}
          />
        ))}
      </div>
      <p className={`text-xs font-medium ${passed < 3 ? "text-red-500" : passed < 5 ? "text-yellow-600" : "text-emerald-600"}`}>
        {level.label}
      </p>
      {pending.length > 0 && (
        <ul className="space-y-0.5">
          {pending.map((r) => (
            <li key={r.label} className="flex items-center gap-1 text-xs text-gray-500">
              <span className="text-red-400">✗</span> {r.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
