# Expected conversation examples

## Journey Checkout golden path

**Người dùng:** Tôi lái xe ở TP.HCM, cần đổ xăng, ăn tối và bãi đỗ xe.

**Atlas:** Returns one `journey` with 2–3 organically ranked, dataset-grounded actions, exact simulated VND totals, reasons, rewards, and visible `Mô phỏng` labels.

**Người dùng:** Rẻ hơn một chút.

**Atlas:** Preserves the fuel/dining/parking kinds and city. It changes an eligible selection only when the recomputed total is strictly lower; otherwise it retains the journey and says no grounded cheaper option exists. One local VETC confirmation creates one simulated receipt, followed by Route Theater or a reduced-motion/manual fallback.

These examples define expected, illustrative behavior for the TASCO map assistant. They are **not transcripts from the live application** and should not be presented as current model output.

The only factual source for POIs, profiles, scenarios, and evaluation IDs in this document is `src/data/dataset.json`. That dataset is Vietnamese, synthetic, and generated from `dataset.xlsx` on 2026-07-11. The `confidence band` values below are proposed acceptance expectations for how certain a final destination or recommendation is; they are not fields supplied by the dataset. They are distinct from the API's numeric response-behavior `confidence`: the API can return `0.99` when it is highly confident that it must clarify, even though confidence in either destination remains low.

## Confidence bands

- **High:** the intent and named POIs are directly supported by the evaluation case and POI attributes.
- **Medium:** the main intent is clear, but one constraint needs clarification or is not explicitly represented in the POI attributes.
- **Low:** the assistant must clarify an ambiguous entity before recommending or navigating.

## Coverage

| Capability | Examples |
| --- | --- |
| Conversational search | 1, 11 |
| Multi-turn context | 2, 6, 12 |
| Clarification | 3, 4, 8, 14 |
| Personalization | 1, 5, 6, 13, 15 |
| Planning | 6, 12, 14 |
| Navigation | 7, 8 |
| Explainability | 9, 10, 13, 15 |
| Voice-like input | 11 |

## 1. Find a quiet work cafe nearby

**Source:** evaluation `P001`; scenario `S001`; profile `U001`.

**Turns**

> **User:** Tìm quán cà phê yên tĩnh để làm việc gần tôi.
>
> **Assistant — expected/illustrative:** Gần vị trí của bạn ở Quận 1, **The Workshop Coffee (POI001)** là lựa chọn khớp nhất: có wifi, ổ cắm, máy lạnh và được gắn thuộc tính yên tĩnh, phù hợp làm việc. **Trung Nguyên Legend Café Lý Tự Trọng (POI017)** cũng có wifi và không gian yên tĩnh, hợp cho một buổi làm việc ngắn hoặc gặp đối tác. Tôi sẽ đánh dấu cả hai trên bản đồ.

**Expected structured fields**

- `intent`: `Coffee Shop Search`
- `recommendation POI IDs/names`: `POI001 — The Workshop Coffee`; `POI017 — Trung Nguyên Legend Café Lý Tự Trọng`
- `confidence band`: `High`
- `mapAction`: `search category cafe near user with work-friendly attributes`
- `session-context effect`: Set active category to cafe; retain `currentLocation=Quận 1`, `wifi`, `yên tĩnh`, and `làm việc` for follow-up filtering.

## 2. Keep dinner context across turns

**Source:** evaluation `P009`; scenario pattern `S004`; profile `U005`.

**Turns**

> **User:** Tìm quán ăn tối.
>
> **Assistant:** Bạn đi với ai, và muốn không gian như thế nào?
>
> **User:** Đi với bạn gái, muốn chỗ có view đẹp.
>
> **Assistant — expected/illustrative:** Mình giữ yêu cầu **ăn tối** và thêm tiêu chí **hẹn hò, view đẹp**. **Nhà hàng Secret Garden (POI021)** có món Việt, không gian sân vườn và thuộc tính hẹn hò, view đẹp. Nếu hai bạn thích rooftop và không khí về đêm, **Rooftop Chill Skybar (POI005)** cũng phù hợp nhưng thuộc phân khúc cao cấp. Tôi sẽ ghim cả hai để bạn so sánh.

**Expected structured fields**

- `intent`: `Romantic Restaurant Search`
- `recommendation POI IDs/names`: `POI021 — Nhà hàng Secret Garden`; `POI005 — Rooftop Chill Skybar`
- `confidence band`: `High`
- `mapAction`: `recommend restaurant date view`
- `session-context effect`: Preserve `ăn tối` from turn 1; add companion `bạn gái` and attributes `hẹn hò`, `view đẹp` from turn 3.

## 3. Clarify an ambiguous “Galaxy” destination

**Source:** evaluation `P003`; scenario `S002`; profile `U004`.

**Turns**

> **User:** Đưa tôi đến Galaxy.
>
> **Assistant — expected/illustrative:** Bạn muốn đến **Galaxy Nguyễn Du (POI008)**, rạp chiếu phim ở Quận 1, TP.HCM, hay **Galaxy Hotel Đà Nẵng (POI009)** ở Sơn Trà? Hãy chọn một địa điểm để tôi bắt đầu chỉ đường.

**Expected structured fields**

- `intent`: `Ambiguous Navigation`
- `recommendation POI IDs/names`: No recommendation yet; clarification candidates are `POI008 — Galaxy Nguyễn Du` and `POI009 — Galaxy Hotel Đà Nẵng`.
- `confidence band`: `Low` until the user selects a candidate
- `mapAction`: `clarify(ambiguous_entity=Galaxy, candidates=Galaxy Cinema;Galaxy Hotel)`
- `session-context effect`: Store unresolved entity `Galaxy` and candidate IDs; do not set a destination or start a route.

## 4. Clarify a brand or branch request

**Source:** evaluation `P017`; profile `U003`.

**Turns**

> **User:** Vincom.
>
> **Assistant — expected/illustrative:** Bạn đang tìm **Vincom Center Đồng Khởi (POI007)** ở Quận 1, TP.HCM, hay **CGV Vincom Bà Triệu (POI016)** ở Hà Nội? Nếu bạn muốn một chi nhánh khác, cho tôi biết thành phố hoặc khu vực.

**Expected structured fields**

- `intent`: `Brand Search Ambiguous`
- `recommendation POI IDs/names`: No final recommendation; candidates are `POI007 — Vincom Center Đồng Khởi` and `POI016 — CGV Vincom Bà Triệu`.
- `confidence band`: `Low`
- `mapAction`: `clarify brand branch`
- `session-context effect`: Record `brand=Vincom`; wait for city, district, or candidate selection before moving the map.

## 5. Personalize a cafe for a business meeting

**Source:** evaluation `P016`; profile `U001`; personalization pattern `S007`.

**Turns**

> **User:** Tôi muốn chỗ gặp đối tác, không quá ồn.
>
> **Assistant — expected/illustrative:** Với hồ sơ của bạn ở Quận 1 và ưu tiên không gian yên tĩnh, **Trung Nguyên Legend Café Lý Tự Trọng (POI017)** phù hợp nhất vì dữ liệu ghi rõ `gặp đối tác`, `yên tĩnh` và `wifi`. **The Workshop Coffee (POI001)** là phương án thứ hai, cũng yên tĩnh, có wifi và phù hợp làm việc hoặc gặp đối tác. Tôi không ưu tiên Highlands Nguyễn Huệ vì dữ liệu ghi nhận nơi đó đông khách.

**Expected structured fields**

- `intent`: `Business Meeting Cafe`
- `recommendation POI IDs/names`: `POI017 — Trung Nguyên Legend Café Lý Tự Trọng`; `POI001 — The Workshop Coffee`
- `confidence band`: `High`
- `mapAction`: `recommend cafe meeting quiet`
- `session-context effect`: Apply profile `U001` location and preferences; retain the negative constraint `không quá ồn` for reranking.

## 6. Build a compact Đà Nẵng beach-and-food plan

**Source:** evaluation `P005`; scenario `S005`; profile `U003`.

**Turns**

> **User:** Tôi ở Đà Nẵng cuối tuần này, muốn đi biển và ăn đặc sản.
>
> **Assistant — expected/illustrative:** Gợi ý một lịch trình gọn: buổi sáng dành thời gian ở khu biển Mỹ Khê; nếu cần nơi lưu trú gần biển, **Khách sạn Sala Đà Nẵng Beach (POI013)** ở Sơn Trà có hồ bơi và phòng phù hợp gia đình. Buổi trưa đi **Mì Quảng Bà Mua (POI014)** ở Hải Châu để ăn đặc sản với mức giá được dữ liệu mô tả là hợp lý. Tôi sẽ ghim hai điểm để bạn nhìn thứ tự di chuyển trên bản đồ.

**Expected structured fields**

- `intent`: `Travel Planning`
- `recommendation POI IDs/names`: `POI013 — Khách sạn Sala Đà Nẵng Beach`; `POI014 — Mì Quảng Bà Mua`
- `confidence band`: `High` for the named hotel and restaurant; the beach stop itself has no named POI record in the dataset
- `mapAction`: `plan beach + food in Đà Nẵng`
- `session-context effect`: Create an ordered plan with city `Đà Nẵng`, duration `weekend`, and goals `biển`, `đặc sản`; keep profile `U003` preference for an easy route.

## 7. Route between two named POIs

**Source:** evaluation `P006`; scenario `S006`.

**Turns**

> **User:** Chỉ đường từ Hồ Gươm đến Phở Thìn Lò Đúc.
>
> **Assistant — expected/illustrative:** Tôi đã đặt điểm đi là **Hồ Hoàn Kiếm (POI030)** và điểm đến là **Phở Thìn Lò Đúc (POI018), 13 Lò Đúc, Hai Bà Trưng**. Bạn muốn đi bộ, xe máy hay ô tô để tôi chọn tuyến phù hợp?

**Expected structured fields**

- `intent`: `Navigation`
- `recommendation POI IDs/names`: Origin `POI030 — Hồ Hoàn Kiếm`; destination `POI018 — Phở Thìn Lò Đúc`
- `confidence band`: `High` for origin and destination; route details wait for travel mode
- `mapAction`: `route(origin=Hồ Hoàn Kiếm, destination=Phở Thìn Lò Đúc)`
- `session-context effect`: Set origin and destination; leave `travelMode` unresolved for the next turn.

## 8. Ask for a precise origin before giving an ETA

**Source:** evaluation `P015`; profile `U008`.

**Turns**

> **User:** Đi sân bay Tân Sơn Nhất từ trung tâm Quận 1 mất bao lâu?
>
> **Assistant — expected/illustrative:** Điểm đến là **Sân bay Tân Sơn Nhất (POI026)**. “Trung tâm Quận 1” còn khá rộng, nên bạn muốn xuất phát từ vị trí hiện tại hay một địa điểm cụ thể, chẳng hạn Chợ Bến Thành? Sau khi có điểm đi và phương tiện, tôi mới có thể tạo tuyến và ETA phù hợp.

**Expected structured fields**

- `intent`: `Navigation/ETA`
- `recommendation POI IDs/names`: Destination `POI026 — Sân bay Tân Sơn Nhất`; no origin selected yet
- `confidence band`: `Medium`
- `mapAction`: `ask origin clarification or route from Quận 1`
- `session-context effect`: Retain destination and broad origin area `Quận 1`; request exact origin and travel mode before calculating ETA.

## 9. Explain a business-hotel recommendation without inventing attributes

**Source:** evaluation `P020`; profile `U004`.

**Turns**

> **User:** Tóm tắt giúp tôi vì sao Lotte Hotel phù hợp công tác.
>
> **Assistant — expected/illustrative:** **Lotte Hotel Hanoi (POI012)** phù hợp công tác vì dữ liệu xếp khách sạn vào nhóm `business`, ở Ba Đình, có rating 4,7 và thuộc phân khúc 5 sao. Dữ liệu POI hiện tại **không liệt kê wifi**, nên tôi không nên khẳng định chất lượng wifi dù phần tóm tắt đánh giá có nhắc đến tiêu chí này.

**Expected structured fields**

- `intent`: `Explanation`
- `recommendation POI IDs/names`: `POI012 — Lotte Hotel Hanoi`
- `confidence band`: `High` for business fit; `Low` for any wifi-specific claim
- `mapAction`: `explain recommendation`
- `session-context effect`: Keep `POI012` as the active selection; add a provenance note that wifi is unsupported by the POI record.

## 10. Explain why a restaurant fits a date

**Source:** evaluations `P027` and `P004`; scenario `S003`; profile `U005`.

**Turns**

> **User:** Vì sao bạn gợi ý Secret Garden cho hẹn hò?
>
> **Assistant — expected/illustrative:** **Nhà hàng Secret Garden (POI021)** được gợi ý vì dữ liệu gắn trực tiếp các thuộc tính `hẹn hò`, `view đẹp` và `ẩm thực Việt`; phần mô tả còn ghi đây là nhà hàng phong cách sân vườn. Vì vậy nó khớp yêu cầu một buổi hẹn lãng mạn ở Quận 1 tốt hơn một địa điểm chỉ nổi tiếng nhưng không có các thuộc tính đó.

**Expected structured fields**

- `intent`: `Explain Recommendation`
- `recommendation POI IDs/names`: `POI021 — Nhà hàng Secret Garden`
- `confidence band`: `High`
- `mapAction`: `explain POI attributes`
- `session-context effect`: Resolve “Secret Garden” to `POI021`; preserve the prior date-place criteria for comparison or follow-up.

## 11. Understand voice-like, informal Vietnamese

**Source:** evaluation `P029`; voice-like pattern `S008`; profile `U001`.

**Turns**

> **User:** kiếm quán cà phê nào gần đây làm việc được không đông quá
>
> **Assistant — expected/illustrative:** Mình hiểu bạn đang tìm quán cà phê gần vị trí hiện tại để làm việc và muốn tránh nơi quá đông. **The Workshop Coffee (POI001)** có wifi, ổ cắm và thuộc tính yên tĩnh, phù hợp làm việc. **Trung Nguyên Legend Café Lý Tự Trọng (POI017)** cũng có wifi và yên tĩnh. Dữ liệu không có số đông khách theo thời gian thực, nên tôi chỉ có thể dựa trên thuộc tính đã lưu chứ chưa đảm bảo quán đang vắng.

**Expected structured fields**

- `intent`: `Work Cafe Search`
- `recommendation POI IDs/names`: `POI001 — The Workshop Coffee`; `POI017 — Trung Nguyên Legend Café Lý Tự Trọng`
- `confidence band`: `Medium` because live crowd level is unavailable
- `mapAction`: `search cafe work quiet nearby`
- `session-context effect`: Normalize voice-like input into category `cafe`, purpose `làm việc`, location `nearby`, and negative preference `không đông quá`.

## 12. Turn a long conversation into a walk-and-coffee plan

**Source:** evaluation `P028`; profile `U006`.

**Turns**

> **User:** Tôi muốn đi chơi ở Hà Nội.
>
> **Assistant:** Bạn thích kiểu địa điểm nào?
>
> **User:** Chỗ có thể đi bộ, chụp hình, uống cà phê gần đó.
>
> **Assistant — expected/illustrative:** Bạn có thể bắt đầu ở **Hồ Hoàn Kiếm (POI030)** vì dữ liệu ghi rõ phù hợp đi bộ, check-in và có view đẹp. Sau đó ghé **Cộng Cà Phê Hồ Gươm (POI010)** gần hồ để uống cà phê; quán có view hồ và wifi, nhưng dữ liệu cũng đánh dấu là đông khách. Tôi sẽ nối hai điểm thành một kế hoạch ngắn trên bản đồ.

**Expected structured fields**

- `intent`: `Discovery + Nearby Cafe`
- `recommendation POI IDs/names`: `POI030 — Hồ Hoàn Kiếm`; `POI010 — Cộng Cà Phê Hồ Gươm`
- `confidence band`: `High`
- `mapAction`: `plan POI + nearby cafe`
- `session-context effect`: Preserve city `Hà Nội`; combine follow-up constraints `đi bộ`, `chụp hình`, and `cafe gần đó` into an ordered two-stop plan.

## 13. Compare two date options with reasons

**Source:** evaluation `P004`; scenario `S003`; profile `U005`.

**Turns**

> **User:** Gợi ý nơi hẹn hò lãng mạn tối nay ở Quận 1.
>
> **Assistant — expected/illustrative:** Nếu muốn ngắm cảnh đêm và không ngại phân khúc cao cấp, chọn **Rooftop Chill Skybar (POI005)** vì có view đẹp, nightlife và thuộc tính hẹn hò. Nếu thích bữa tối món Việt trong không gian sân vườn, chọn **Nhà hàng Secret Garden (POI021)**. Cả hai đều ở Quận 1; tôi sẽ ghim cả hai để bạn chọn theo không khí mong muốn.

**Expected structured fields**

- `intent`: `Date Recommendation`
- `recommendation POI IDs/names`: `POI005 — Rooftop Chill Skybar`; `POI021 — Nhà hàng Secret Garden`
- `confidence band`: `High`
- `mapAction`: `recommend date places Quận 1`
- `session-context effect`: Apply profile `U005` preferences `hẹn hò`, `rooftop`, and `nhà hàng lãng mạn`; retain `tối nay` and `Quận 1`.

## 14. Plan driver support without pretending to know the route

**Source:** evaluations `P025` and `P008`; profile `U008`.

**Turns**

> **User:** Tôi lái xe đêm, cần nơi ăn khuya và đổ xăng.
>
> **Assistant — expected/illustrative:** Trong dữ liệu hiện có, **Cây xăng Petrolimex Võ Văn Kiệt (POI024)** mở 24/7 và có toilet, nên phù hợp với nhu cầu đổ xăng ban đêm. Tôi chưa có điểm đến hoặc tuyến đường của bạn, và cũng chưa có một POI quán ăn khuya được nêu tên trong ca đánh giá này. Bạn đang đi về hướng nào để tôi lọc điểm dừng đúng tuyến thay vì ghim một nơi không tiện đường?

**Expected structured fields**

- `intent`: `Driver Support Planning`
- `recommendation POI IDs/names`: Provisional `POI024 — Cây xăng Petrolimex Võ Văn Kiệt`; no grounded named late-food POI yet
- `confidence band`: `Medium`
- `mapAction`: `search gas + late food`
- `session-context effect`: Retain `lái xe đêm`, `đổ xăng`, and `ăn khuya`; mark route or destination as required before final ranking.

## 15. Recommend a central place for foreign guests

**Source:** evaluation `P030`; profile `U004`.

**Turns**

> **User:** Tôi cần nơi tiếp khách nước ngoài ở trung tâm Sài Gòn.
>
> **Assistant — expected/illustrative:** **Nhà hàng Secret Garden (POI021)** ở Quận 1 phù hợp nếu bạn muốn giới thiệu ẩm thực Việt; dữ liệu mô tả nơi này phù hợp tiếp khách, có không gian sân vườn và view đẹp. **Pizza 4P's Hai Bà Trưng (POI004)** cũng ở Quận 1, có rating 4,7, nhận đặt bàn và phục vụ đồ Ý, phù hợp khi bạn muốn lựa chọn quen thuộc hơn. Tôi sẽ ghim hai điểm để so sánh.

**Expected structured fields**

- `intent`: `Business Dining Recommendation`
- `recommendation POI IDs/names`: `POI021 — Nhà hàng Secret Garden`; `POI004 — Pizza 4P's Hai Bà Trưng`
- `confidence band`: `High`
- `mapAction`: `recommend business dining city center`
- `session-context effect`: Apply profile `U004` preference for fast, clear business recommendations; retain `khách nước ngoài` and `trung tâm Sài Gòn` as ranking context.

## Implementation notes for evaluators

- Treat every assistant response above as an **expected/illustrative target**, not a promise of exact generated wording.
- A correct response may use different phrasing, but it should preserve the intent, named POIs, clarification behavior, map action, and session-context effect.
- Do not start navigation when an entity, branch, airport, origin, or travel mode is unresolved.
- Do not claim live traffic, ETA, crowd level, opening status, price, or wifi quality unless the runtime has a source for it. The synthetic POI record alone is not live data.
- When `expectedResponseSummary` and a POI record disagree, ground the explanation in the POI record and state the missing evidence. Example 9 demonstrates this rule for wifi at Lotte Hotel Hanoi.
