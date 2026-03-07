"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { PhotoUploader } from "@/components/PhotoUploader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SERVICE_OPTIONS } from "@/lib/types";

type Props = {
  contractorSlug: string;
};

export function PublicLeadForm({ contractorSlug }: Props) {
  const [customerFirstName, setCustomerFirstName] = useState("");
  const [customerLastName, setCustomerLastName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [address, setAddress] = useState("");
  const [addressPlaceId, setAddressPlaceId] = useState<string | undefined>(undefined);
  const [lat, setLat] = useState<number | undefined>(undefined);
  const [lng, setLng] = useState<number | undefined>(undefined);
  const [services, setServices] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(() => {
    return (
      customerFirstName.trim().length >= 2 &&
      address.trim().length >= 5 &&
      services.length > 0 &&
      Boolean(customerPhone.trim() || customerEmail.trim())
    );
  }, [customerFirstName, address, services, customerPhone, customerEmail]);

  const toggleService = (service: string, checked: boolean) => {
    if (checked) setServices((prev) => [...new Set([...prev, service])]);
    else setServices((prev) => prev.filter((s) => s !== service));
  };

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSubmit) {
      toast.error("Please fill required fields and provide phone or email.");
      return;
    }

    setLoading(true);
    try {
      const customerName = [customerFirstName.trim(), customerLastName.trim()]
        .filter(Boolean)
        .join(" ");
      const formData = new FormData();
      formData.append("contractorSlug", contractorSlug);
      formData.append("customerName", customerName);
      formData.append("customerPhone", customerPhone.trim());
      formData.append("customerEmail", customerEmail.trim());
      formData.append("addressFull", address.trim());
      if (addressPlaceId) formData.append("addressPlaceId", addressPlaceId);
      if (lat !== undefined) formData.append("lat", String(lat));
      if (lng !== undefined) formData.append("lng", String(lng));
      services.forEach((service) => formData.append("services[]", service));
      formData.append("description", description.trim());
      photos.forEach((photo) => formData.append("photos", photo));

      const res = await fetch("/api/public/lead-submit", {
        method: "POST",
        body: formData
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to submit request.");
      setSubmitted(true);
      toast.success("Request sent.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to submit request.");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-6">
        <p className="text-sm font-medium text-green-800">
          Request sent - you will receive your quote shortly.
        </p>
      </div>
    );
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <AddressAutocomplete
        value={address}
        onAddressChange={setAddress}
        onPlaceResolved={({ placeId, lat: latVal, lng: lngVal }) => {
          setAddressPlaceId(placeId);
          setLat(latVal);
          setLng(lngVal);
        }}
      />

      <div className="space-y-2">
        <Label>Services</Label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {SERVICE_OPTIONS.map((service) => (
            <label
              key={service}
              className="flex items-center gap-2 rounded-md border border-gray-200 bg-white p-2 text-sm"
            >
              <Checkbox
                checked={services.includes(service)}
                onCheckedChange={(checked) => toggleService(service, checked === true)}
              />
              {service}
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description (optional)</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Tell us what work you need done."
        />
      </div>

      <PhotoUploader files={photos} setFiles={setPhotos} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="customer-first-name">First name</Label>
          <Input
            id="customer-first-name"
            value={customerFirstName}
            onChange={(e) => setCustomerFirstName(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="customer-last-name">Last name (optional)</Label>
          <Input
            id="customer-last-name"
            value={customerLastName}
            onChange={(e) => setCustomerLastName(e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="customer-phone">Phone (optional)</Label>
          <Input
            id="customer-phone"
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="customer-email">Email (optional)</Label>
        <Input
          id="customer-email"
          type="email"
          value={customerEmail}
          onChange={(e) => setCustomerEmail(e.target.value)}
        />
        <p className="text-xs text-gray-500">Provide at least one: phone or email.</p>
      </div>

      <Button className="w-full sm:w-auto" disabled={!canSubmit || loading}>
        {loading ? "Sending..." : "Get My Quote"}
      </Button>
    </form>
  );
}
