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
    <div className="min-w-0 max-w-full space-y-10">
      {services.map((serviceEntry, index) => {
        const sectionNumber = index + 1;
        const idPrefix = `service-${sectionNumber}`;

        return (
          <section key={idPrefix} className="min-w-0 max-w-full space-y-4">
            <div className="space-y-1">
              <h3 className="text-[13px] font-semibold text-[#374151]">
                Service {sectionNumber} <span className="text-[#2563EB]">*</span>
              </h3>
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
              <div className="min-w-0 max-w-full space-y-3 rounded-[12px] border border-[#E5E7EB] bg-white p-4">
                <Label className="text-[13px] font-semibold text-[#374151]">
                  Do you need help with another service? <span className="text-[#2563EB]">*</span>
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
                        className={`flex min-w-0 max-w-full cursor-pointer items-center gap-3 rounded-[10px] border p-3 text-sm transition-colors ${
                          serviceEntry.addAnother === option.value
                            ? "border-[#2563EB] bg-[#EFF6FF] text-[#111827]"
                            : "border-[#E5E7EB] bg-white text-[#374151] hover:border-[#BFDBFE]"
                        }`}
                      >
                        <input
                          id={optionId}
                          type="radio"
                          name={`${idPrefix}-add-another`}
                          value={option.value}
                          checked={serviceEntry.addAnother === option.value}
                          onChange={() => onAddAnotherChange(index, option.value)}
                          className="h-4 w-4 border-[#D1D5DB] text-[#2563EB] focus:ring-[#2563EB]"
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
