"use client";
import * as React from "react";

type Props = {
  action: (formData: FormData) => Promise<void> | void;
  className?: string;
  label?: string;
  confirmMessage?: string;
};

export default function DeleteButton({
  action,
  className,
  label = "Delete",
  confirmMessage = "Are you sure you want to delete?",
}: Props) {
  const onClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!confirm(confirmMessage)) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  return (
    <button type="submit" className={className} formAction={action} onClick={onClick}>
      {label}
    </button>
  );
}

