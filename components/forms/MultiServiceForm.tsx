"use client";

import { ServiceQuestions } from "@/components/forms/ServiceQuestions";
import { ServiceSelector } from "@/components/forms/ServiceSelector";
import { Label } from "@/components/ui/label";
import type { ServiceQuestionAnswerValue } from "@/lib/serviceQuestions";
import type { ServiceType } from "@/lib/services";

export type MultiServiceEntry = {
  service: ServiceType | "";
  answers: Record<string, ServiceQuestionAnswerValue>;
  addAnother: "no" | "yes";
};

type Props = {
  services: MultiServiceEntry[];
  onServiceChange: (index: number, service: ServiceType | "") => void;
  onAnswerChange: (index: number, key: string, value: ServiceQuestionAnswerValue) => void;
  onAddAnotherChange: (index: number, value: "no" | "yes") => void;
};

export function MultiServiceForm({
  services,
  onServiceChange,
  onAnswerChange,
  onAddAnotherChange
}: Props) {
  return (
    <div className="space-y-10">
      {services.map((serviceEntry, index) => {
        const sectionNumber = index + 1;
        const idPrefix = `service-${sectionNumber}`;

        return (
          <section key={idPrefix} className="space-y-4">
            <div className="space-y-1">
              <h3 className="text-sm font-medium text-gray-900">Service {sectionNumber}</h3>
            </div>

            <ServiceSelector
              value={serviceEntry.service}
              onChange={(service) => onServiceChange(index, service)}
              inputId={`${idPrefix}-selector`}
            />

            <ServiceQuestions
              selectedService={serviceEntry.service}
              answers={serviceEntry.answers}
              onAnswerChange={(key, value) => onAnswerChange(index, key, value)}
              idPrefix={idPrefix}
            />

            {serviceEntry.service ? (
              <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
                <Label className="text-sm font-medium text-gray-900">
                  Do you need help with another service?
                </Label>
                <div className="space-y-2">
                  {[
                    { value: "no" as const, label: "No, continue" },
                    { value: "yes" as const, label: "Yes, add another service" }
                  ].map((option) => {
                    const optionId = `${idPrefix}-add-another-${option.value}`;
                    return (
                      <label
                        key={option.value}
                        htmlFor={optionId}
                        className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition-colors ${
                          serviceEntry.addAnother === option.value
                            ? "border-blue-600 bg-blue-50 text-blue-900"
                            : "border-gray-200 bg-white text-gray-700 hover:border-blue-300"
                        }`}
                      >
                        <input
                          id={optionId}
                          type="radio"
                          name={`${idPrefix}-add-another`}
                          value={option.value}
                          checked={serviceEntry.addAnother === option.value}
                          onChange={() => onAddAnotherChange(index, option.value)}
                          className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span>{option.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
