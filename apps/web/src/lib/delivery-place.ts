export type DeliveryPlaceCoordinates = {
  latitude: number;
  longitude: number;
};

export function getSelectedDeliveryCoordinates(): DeliveryPlaceCoordinates | null {
  if (typeof document === "undefined") return null;

  const addressInput = document.querySelector<HTMLInputElement>('input[placeholder="Address"]');
  const landmarkInput = document.querySelector<HTMLInputElement>('input[placeholder="Landmark"]');

  for (const input of [addressInput, landmarkInput]) {
    if (!input) continue;

    const selectedValue = input.dataset.placeValue?.trim();
    if (!selectedValue || selectedValue !== input.value.trim()) continue;

    const latitude = Number(input.dataset.latitude);
    const longitude = Number(input.dataset.longitude);
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      return { latitude, longitude };
    }
  }

  return null;
}
