"use client";

import {
  type ComponentPropsWithoutRef,
  type FormEvent,
  type MutableRefObject,
  type Ref,
  forwardRef,
  useEffect,
  useRef,
} from "react";
import { useFormStatus } from "react-dom";

type ActionFormProps = ComponentPropsWithoutRef<"form">;

type SubmitControl = HTMLButtonElement | HTMLInputElement;

function setRef<T>(ref: Ref<T> | undefined, value: T) {
  if (typeof ref === "function") {
    ref(value);
    return;
  }
  if (ref) {
    (ref as MutableRefObject<T>).current = value;
  }
}

function getSubmitControls(form: HTMLFormElement) {
  return Array.from(
    form.querySelectorAll<SubmitControl>('button[type="submit"], button:not([type]), input[type="submit"]'),
  );
}

function unlockForm(form: HTMLFormElement | null) {
  if (!form) return;

  delete form.dataset.submitLocked;
  delete form.dataset.submitting;

  for (const control of getSubmitControls(form)) {
    const didDisable = control.dataset.actionFormDisabled === "true";
    const wasDisabled = control.dataset.actionFormWasDisabled === "true";

    if (didDisable && !wasDisabled) {
      control.disabled = false;
    }

    delete control.dataset.actionFormDisabled;
    delete control.dataset.actionFormWasDisabled;
    delete control.dataset.pending;
    control.removeAttribute("aria-disabled");
  }
}

function lockForm(form: HTMLFormElement, event: FormEvent<HTMLFormElement>) {
  form.dataset.submitLocked = "true";
  form.dataset.submitting = "true";

  const nativeEvent = event.nativeEvent;
  const submitter = nativeEvent instanceof SubmitEvent ? nativeEvent.submitter : null;
  const submitControls = getSubmitControls(form);
  const pendingControl = submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement
    ? submitter
    : submitControls[0] ?? null;

  for (const control of submitControls) {
    control.dataset.actionFormWasDisabled = String(control.disabled);
    if (!control.disabled) {
      control.disabled = true;
      control.dataset.actionFormDisabled = "true";
    } else {
      control.dataset.actionFormDisabled = "false";
    }

    control.setAttribute("aria-disabled", "true");
    if (control === pendingControl) {
      control.dataset.pending = "true";
    } else {
      delete control.dataset.pending;
    }
  }
}

function FormStatusObserver({
  formRef,
}: {
  formRef: MutableRefObject<HTMLFormElement | null>;
}) {
  const { pending } = useFormStatus();

  useEffect(() => {
    if (pending) {
      if (formRef.current) {
        formRef.current.dataset.submitting = "true";
      }
      return;
    }

    unlockForm(formRef.current);
  }, [pending, formRef]);

  return null;
}

export const ActionForm = forwardRef<HTMLFormElement, ActionFormProps>(function ActionForm(
  { children, onReset, onSubmitCapture, ...props },
  ref,
) {
  const localRef = useRef<HTMLFormElement | null>(null);

  return (
    <form
      {...props}
      data-action-form="true"
      ref={(node) => {
        localRef.current = node;
        setRef(ref, node);
      }}
      onReset={(event) => {
        unlockForm(event.currentTarget);
        onReset?.(event);
      }}
      onSubmitCapture={(event) => {
        const form = event.currentTarget;

        if (form.dataset.submitLocked === "true") {
          event.preventDefault();
          event.stopPropagation();
          return;
        }

        lockForm(form, event);
        onSubmitCapture?.(event);

        if (event.defaultPrevented) {
          unlockForm(form);
        }
      }}
    >
      {children}
      <FormStatusObserver formRef={localRef} />
    </form>
  );
});
