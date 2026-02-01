import { useState, useRef, useEffect, useCallback } from "react";

interface InlineEditProps {
  value: string;
  onSave: (newValue: string) => void;
  className?: string;
  placeholder?: string;
  inputClassName?: string;
}

export function InlineEdit({
  value,
  onSave,
  className = "",
  placeholder = "Untitled",
  inputClassName = "",
}: InlineEditProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    setEditValue(value);
  }, [value]);

  const commit = useCallback(() => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== value) {
      onSave(trimmed);
    } else {
      setEditValue(value);
    }
    setIsEditing(false);
  }, [editValue, value, onSave]);

  const revert = useCallback(() => {
    setEditValue(value);
    setIsEditing(false);
  }, [value]);

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            revert();
          }
        }}
        className={`border border-blue-400 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 ${inputClassName}`}
        placeholder={placeholder}
      />
    );
  }

  return (
    <span
      onClick={() => setIsEditing(true)}
      className={`cursor-pointer hover:bg-gray-100 rounded px-1 py-0.5 transition-colors ${className}`}
      title="Click to edit"
    >
      {value || placeholder}
    </span>
  );
}
