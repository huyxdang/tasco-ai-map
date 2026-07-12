export function routeTheaterAvailability(mapReady: boolean) {
  return mapReady
    ? { canPlay: true, message: "" }
    : { canPlay: false, message: "Bản đồ 3D chưa sẵn sàng. Biên nhận và hành trình vẫn được giữ nguyên." };
}
