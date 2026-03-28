"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface PortfolioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialData?: any;
  onSuccess: () => void;
}

export function PortfolioDialog({
  open,
  onOpenChange,
  initialData,
  onSuccess,
}: PortfolioDialogProps) {
  const isEditing = !!initialData;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    Owner: "",
    Broker: "",
    Ticker: "",
    Name: "",
    Shares: "",
    Currency: "USD",
    CostPrice: "",
  });

  useEffect(() => {
    if (open) {
      if (isEditing && initialData) {
        setFormData({
          Owner: initialData.Owner || "",
          Broker: initialData.Broker || "",
          Ticker: initialData.Ticker || "",
          Name: initialData.Name || "",
          Shares: initialData.Shares?.toString() || "",
          Currency: initialData.Currency || "USD",
          CostPrice: initialData.CostPrice?.toString() || "",
        });
      } else {
        setFormData({
          Owner: "",
          Broker: "",
          Ticker: "",
          Name: "",
          Shares: "",
          Currency: "USD",
          CostPrice: "",
        });
      }
      setError(null);
    }
  }, [open, isEditing, initialData]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSelectChange = (value: string | null) => {
    if (value) {
      setFormData((prev) => ({ ...prev, Currency: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Basic validation
    if (!formData.Ticker || !formData.Shares || !formData.CostPrice) {
      setError("Ticker, Shares, and Cost Price are required.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: isEditing ? "edit" : "add",
          payload: {
            ...formData,
            Shares: parseFloat(formData.Shares),
            CostPrice: parseFloat(formData.CostPrice),
          },
        }),
      });

      const json = await res.json();
      if (json.success) {
        onSuccess();
        onOpenChange(false);
      } else {
        setError(json.error || "Failed to save data");
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Holding" : "Add New Holding"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="Ticker">Ticker *</Label>
              <Input
                id="Ticker"
                name="Ticker"
                value={formData.Ticker}
                onChange={handleChange}
                placeholder="e.g. AAPL"
                disabled={isEditing}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="Name">Name</Label>
              <Input
                id="Name"
                name="Name"
                value={formData.Name}
                onChange={handleChange}
                placeholder="e.g. Apple Inc."
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="Owner">Owner</Label>
              <Input
                id="Owner"
                name="Owner"
                value={formData.Owner}
                onChange={handleChange}
                placeholder="e.g. John"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="Broker">Broker</Label>
              <Input
                id="Broker"
                name="Broker"
                value={formData.Broker}
                onChange={handleChange}
                placeholder="e.g. Charles Schwab"
                disabled={isEditing}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="Shares">Shares *</Label>
              <Input
                id="Shares"
                name="Shares"
                type="number"
                step="any"
                value={formData.Shares}
                onChange={handleChange}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="CostPrice">Cost Price *</Label>
              <Input
                id="CostPrice"
                name="CostPrice"
                type="number"
                step="any"
                value={formData.CostPrice}
                onChange={handleChange}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="Currency">Currency</Label>
            <Select value={formData.Currency} onValueChange={handleSelectChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select currency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="TWD">TWD</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {error && <p className="text-sm font-medium text-red-500">{error}</p>}

          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
