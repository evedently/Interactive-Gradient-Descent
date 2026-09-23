import { useEffect, useState } from "react";
import type { ParameterDecl } from "../domain/rules/ruleCompiler";
import { sliderPositionToValue, valueToSliderPosition } from "../domain/rules/parameterSlider";
import type { ParameterizedRunner } from "../domain/simulation/RunnerInterfaces";
import { useRunnerVersion } from "../hooks/useRunnerVersion";

const LOG_SLIDER_STEPS = 2000;
const LINEAR_SLIDER_STEPS = 200;

interface RowProps {
  runner: ParameterizedRunner;
  decl: ParameterDecl;
}

function ParameterRow({ runner, decl }: RowProps) {
  const value = runner.currentParameterValues[decl.name];
  const [text, setText] = useState(String(value));

  // Keep the numeric box in sync when the value changes via the slider,
  // another control, or a rule/loss edit that rebuilt the runner —
  // but not while the presenter is mid-typing (avoid fighting their input).
  useEffect(() => {
    setText(String(value));
  }, [value]);

  const commitText = () => {
    const parsed = Number(text);
    if (Number.isFinite(parsed)) {
      runner.setParameterValue(decl.name, parsed);
    } else {
      setText(String(value)); // invalid input — revert rather than crash or accept garbage
    }
  };

  const sliderStep = decl.log ? 1 / LOG_SLIDER_STEPS : (decl.step ?? (decl.max - decl.min) / LINEAR_SLIDER_STEPS);
  const sliderPosition = decl.log ? valueToSliderPosition(value, decl) : value;
  const sliderMin = decl.log ? 0 : decl.min;
  const sliderMax = decl.log ? 1 : decl.max;

  const handleSliderChange = (raw: number) => {
    const next = decl.log ? sliderPositionToValue(raw, decl) : raw;
    runner.setParameterValue(decl.name, next);
  };

  return (
    <div className="parameter-row">
      <div className="parameter-row-header">
        <label htmlFor={`param-${decl.name}`}>{decl.name}</label>
        <span className="parameter-range-hint">
          [{decl.min}, {decl.max}]{decl.log ? " (log)" : ""}
        </span>
      </div>
      <div className="parameter-row-controls">
        <input
          id={`param-${decl.name}`}
          type="range"
          min={sliderMin}
          max={sliderMax}
          step={sliderStep}
          value={sliderPosition}
          onChange={(e) => handleSliderChange(Number(e.target.value))}
        />
        <input
          className="parameter-number-input"
          type="text"
          inputMode="decimal"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitText();
          }}
        />
        <button
          className="parameter-reset-button"
          onClick={() => runner.resetParameterToDefault(decl.name)}
          title={`Reset to default (${decl.defaultValue})`}
        >
          ↺
        </button>
      </div>
    </div>
  );
}

interface Props {
  runner: ParameterizedRunner;
}

/**
 * One editable slider per `parameter` declaration (spec §4/DESIGN.md §18
 * Phase 3): auto-generated from the rule text, live-editable while paused
 * or running, with a numeric box for exact entry and a per-parameter
 * reset-to-default control. State variables are deliberately not here —
 * they stay read-only display in `RuleLiveValues`.
 */
export function ParametersPanel({ runner }: Props) {
  useRunnerVersion(runner);
  const parameters = runner.parameters;
  if (parameters.length === 0) return null;

  return (
    <section className="panel">
      <h2>Parameters</h2>
      {parameters.map((decl) => (
        <ParameterRow key={decl.name} runner={runner} decl={decl} />
      ))}
    </section>
  );
}
