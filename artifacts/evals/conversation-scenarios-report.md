# TASCO Atlas Conversation Scenario Evaluation

Generated: 2026-07-12T01:56:39.775Z

Source of truth: `dataset.xlsx`, sheet `Conversation_Scenarios` (90 scenarios). Results use the deterministic dataset-backed `handleChat` path; OpenAI prose enhancement is intentionally excluded from ranking evaluation.

## Accuracy

- Exact pass rate: **90/90 (100.0%)**
- Workbook scenarios: **8/8 (100.0%)**
- Synthetic scenarios: **82/82 (100.0%)**
- Partial: **0/90**
- Fail: **0/90**
- Weighted average: **100%**

## Scenario Results

| ID | Category | Score | Status | Returned POIs | Failure layers |
|---|---|---:|---|---|---|
| S001 | Conversational Search | 100% | PASS | POI010 Cộng Cà Phê Hồ Gươm; POI011 Maison de Tet Décor; POI060 Cafe Mộc Hà Nội 60 | None |
| S002 | Clarification Dialog | 100% | PASS | POI008 Galaxy Nguyễn Du; POI009 Galaxy Hotel Đà Nẵng | None |
| S003 | Recommendation Request | 100% | PASS | POI005 Rooftop Chill Skybar; POI004 Pizza 4P's Hai Bà Trưng; POI021 Nhà hàng Secret Garden | None |
| S004 | Multi-turn Search | 100% | PASS | POI004 Pizza 4P's Hai Bà Trưng; POI018 Phở Thìn Lò Đúc; POI019 Bún Chả Hương Liên | None |
| S005 | Planning Assistance | 100% | PASS | POI013 Khách sạn Sala Đà Nẵng Beach; POI014 Mì Quảng Bà Mua; POI028 Công viên 29/3 Đà Nẵng; POI073 Trung tâm thương mại City Plaza Đà Nẵng 73 | None |
| S006 | Navigation Assistance | 100% | PASS | POI003 Chợ Bến Thành | None |
| S007 | Personalized Search | 100% | PASS | POI011 Maison de Tet Décor; POI010 Cộng Cà Phê Hồ Gươm | None |
| S008 | Voice-like Query | 100% | PASS | None | None |
| SYN001 | Clarification Dialog | 100% | PASS | None | None |
| SYN002 | Clarification Dialog | 100% | PASS | None | None |
| SYN003 | Clarification Dialog | 100% | PASS | None | None |
| SYN004 | Clarification Dialog | 100% | PASS | None | None |
| SYN005 | Clarification Dialog | 100% | PASS | None | None |
| SYN006 | Clarification Dialog | 100% | PASS | None | None |
| SYN007 | Clarification Dialog | 100% | PASS | None | None |
| SYN008 | Clarification Dialog | 100% | PASS | None | None |
| SYN009 | Clarification Dialog | 100% | PASS | POI004 Pizza 4P's Hai Bà Trưng; POI021 Nhà hàng Secret Garden | None |
| SYN010 | Clarification Dialog | 100% | PASS | POI010 Cộng Cà Phê Hồ Gươm; POI011 Maison de Tet Décor; POI060 Cafe Mộc Hà Nội 60 | None |
| SYN011 | Clarification Dialog | 100% | PASS | POI008 Galaxy Nguyễn Du; POI009 Galaxy Hotel Đà Nẵng | None |
| SYN012 | Clarification Dialog | 100% | PASS | POI007 Vincom Center Đồng Khởi; POI016 CGV Vincom Bà Triệu | None |
| SYN013 | Clarification Dialog | 100% | PASS | POI026 Sân bay Tân Sơn Nhất; POI027 Sân bay Nội Bài | None |
| SYN014 | Clarification Dialog | 100% | PASS | None | None |
| SYN015 | Clarification Dialog | 100% | PASS | POI008 Galaxy Nguyễn Du | None |
| SYN016 | Conversational Search | 100% | PASS | POI055 Cafe Mộc Hội An 55; POI036 Cafe Mộc Hội An 36 | None |
| SYN017 | Conversational Search | 100% | PASS | POI063 Cafe Mộc Đà Lạt 63; POI076 Cafe Mộc Đà Lạt 76; POI031 Cafe Mộc Đà Lạt 31 | None |
| SYN018 | Conversational Search | 100% | PASS | POI001 The Workshop Coffee; POI017 Trung Nguyên Legend Café Lý Tự Trọng; POI002 Highlands Coffee Nguyễn Huệ | None |
| SYN019 | Conversational Search | 100% | PASS | POI004 Pizza 4P's Hai Bà Trưng; POI021 Nhà hàng Secret Garden | None |
| SYN020 | Conversational Search | 100% | PASS | POI013 Khách sạn Sala Đà Nẵng Beach; POI009 Galaxy Hotel Đà Nẵng; POI049 Khách sạn Sao Việt Đà Nẵng 49 | None |
| SYN021 | Conversational Search | 100% | PASS | POI012 Lotte Hotel Hanoi; POI040 Khách sạn Sao Việt Hà Nội 40; POI034 Khách sạn Sao Việt Hà Nội 34 | None |
| SYN022 | Conversational Search | 100% | PASS | POI028 Công viên 29/3 Đà Nẵng; POI041 Công viên Xanh Đà Nẵng 41; POI080 Công viên Xanh Đà Nẵng 80 | None |
| SYN023 | Conversational Search | 100% | PASS | POI016 CGV Vincom Bà Triệu | None |
| SYN024 | Conversational Search | 100% | PASS | POI007 Vincom Center Đồng Khởi | None |
| SYN025 | Conversational Search | 100% | PASS | POI006 Bệnh viện Bạch Mai | None |
| SYN026 | Conversational Search | 100% | PASS | POI025 ATM Vietcombank Bến Thành | None |
| SYN027 | Conversational Search | 100% | PASS | POI003 Chợ Bến Thành; POI007 Vincom Center Đồng Khởi; POI008 Galaxy Nguyễn Du | None |
| SYN028 | Conversational Search | 100% | PASS | POI002 Highlands Coffee Nguyễn Huệ; POI069 Cafe Mộc TP.HCM 69; POI017 Trung Nguyên Legend Café Lý Tự Trọng | None |
| SYN029 | Personalized Search | 100% | PASS | POI001 The Workshop Coffee; POI017 Trung Nguyên Legend Café Lý Tự Trọng; POI011 Maison de Tet Décor | None |
| SYN030 | Personalized Search | 100% | PASS | POI058 Khu vui chơi KidZone Hà Nội 58 | None |
| SYN031 | Personalized Search | 100% | PASS | POI013 Khách sạn Sala Đà Nẵng Beach; POI009 Galaxy Hotel Đà Nẵng; POI049 Khách sạn Sao Việt Đà Nẵng 49 | None |
| SYN032 | Personalized Search | 100% | PASS | POI005 Rooftop Chill Skybar; POI021 Nhà hàng Secret Garden; POI004 Pizza 4P's Hai Bà Trưng | None |
| SYN033 | Personalized Search | 100% | PASS | POI010 Cộng Cà Phê Hồ Gươm; POI011 Maison de Tet Décor | None |
| SYN034 | Personalized Search | 100% | PASS | POI024 Cây xăng Petrolimex Võ Văn Kiệt | None |
| SYN035 | Personalized Search | 100% | PASS | POI012 Lotte Hotel Hanoi; POI040 Khách sạn Sao Việt Hà Nội 40; POI034 Khách sạn Sao Việt Hà Nội 34 | None |
| SYN036 | Personalized Search | 100% | PASS | POI005 Rooftop Chill Skybar | None |
| SYN037 | Multi-turn Search | 100% | PASS | POI013 Khách sạn Sala Đà Nẵng Beach; POI009 Galaxy Hotel Đà Nẵng; POI049 Khách sạn Sao Việt Đà Nẵng 49 | None |
| SYN038 | Multi-turn Search | 100% | PASS | POI076 Cafe Mộc Đà Lạt 76; POI063 Cafe Mộc Đà Lạt 63; POI031 Cafe Mộc Đà Lạt 31 | None |
| SYN039 | Multi-turn Search | 100% | PASS | POI004 Pizza 4P's Hai Bà Trưng; POI018 Phở Thìn Lò Đúc; POI019 Bún Chả Hương Liên | None |
| SYN040 | Multi-turn Search | 100% | PASS | POI011 Maison de Tet Décor; POI010 Cộng Cà Phê Hồ Gươm; POI060 Cafe Mộc Hà Nội 60 | None |
| SYN041 | Multi-turn Search | 100% | PASS | POI018 Phở Thìn Lò Đúc; POI019 Bún Chả Hương Liên | None |
| SYN042 | Multi-turn Search | 100% | PASS | POI004 Pizza 4P's Hai Bà Trưng; POI021 Nhà hàng Secret Garden | None |
| SYN043 | Multi-turn Search | 100% | PASS | POI045 Khách sạn Sao Việt Nha Trang 45; POI065 Khách sạn Sao Việt Nha Trang 65 | None |
| SYN044 | Multi-turn Search | 100% | PASS | POI055 Cafe Mộc Hội An 55; POI036 Cafe Mộc Hội An 36 | None |
| SYN045 | Navigation Assistance | 100% | PASS | POI003 Chợ Bến Thành | None |
| SYN046 | Navigation Assistance | 100% | PASS | POI018 Phở Thìn Lò Đúc | None |
| SYN047 | Navigation Assistance | 100% | PASS | POI019 Bún Chả Hương Liên | None |
| SYN048 | Navigation Assistance | 100% | PASS | POI003 Chợ Bến Thành | None |
| SYN049 | Navigation Assistance | 100% | PASS | POI026 Sân bay Tân Sơn Nhất | None |
| SYN050 | Navigation Assistance | 100% | PASS | POI003 Chợ Bến Thành | None |
| SYN051 | Navigation Assistance | 100% | PASS | POI012 Lotte Hotel Hanoi | None |
| SYN052 | Navigation Assistance | 100% | PASS | POI006 Bệnh viện Bạch Mai | None |
| SYN053 | Honest No-match | 100% | PASS | None | None |
| SYN054 | Honest No-match | 100% | PASS | None | None |
| SYN055 | Honest No-match | 100% | PASS | None | None |
| SYN056 | Honest No-match | 100% | PASS | None | None |
| SYN057 | Honest No-match | 100% | PASS | None | None |
| SYN058 | Honest No-match | 100% | PASS | None | None |
| SYN059 | Honest No-match | 100% | PASS | None | None |
| SYN060 | Honest No-match | 100% | PASS | None | None |
| SYN061 | Voice-like Query | 100% | PASS | POI010 Cộng Cà Phê Hồ Gươm; POI011 Maison de Tet Décor; POI060 Cafe Mộc Hà Nội 60 | None |
| SYN062 | Voice-like Query | 100% | PASS | POI018 Phở Thìn Lò Đúc; POI019 Bún Chả Hương Liên | None |
| SYN063 | Voice-like Query | 100% | PASS | POI013 Khách sạn Sala Đà Nẵng Beach; POI009 Galaxy Hotel Đà Nẵng; POI049 Khách sạn Sao Việt Đà Nẵng 49 | None |
| SYN064 | Voice-like Query | 100% | PASS | POI017 Trung Nguyên Legend Café Lý Tự Trọng; POI001 The Workshop Coffee; POI002 Highlands Coffee Nguyễn Huệ | None |
| SYN065 | Voice-like Query | 100% | PASS | POI071 Khách sạn Sao Việt TP.HCM 71 | None |
| SYN066 | Voice-like Query | 100% | PASS | None | None |
| SYN067 | Voice-like Query | 100% | PASS | POI004 Pizza 4P's Hai Bà Trưng; POI021 Nhà hàng Secret Garden | None |
| SYN068 | Voice-like Query | 100% | PASS | POI068 Cafe Mộc Đà Nẵng 68; POI044 Điểm check-in Panorama Đà Nẵng 44; POI052 Cafe Mộc Đà Nẵng 52 | None |
| SYN069 | Planning Assistance | 100% | PASS | POI014 Mì Quảng Bà Mua; POI028 Công viên 29/3 Đà Nẵng; POI041 Công viên Xanh Đà Nẵng 41 | None |
| SYN070 | Planning Assistance | 100% | PASS | POI043 Khu vui chơi KidZone Đà Lạt 43; POI079 Công viên Xanh Đà Lạt 79; POI054 ATM BIDV Đà Lạt 54; POI048 Bệnh viện Minh Tâm Đà Lạt 48 | None |
| SYN071 | Planning Assistance | 100% | PASS | POI006 Bệnh viện Bạch Mai; POI030 Hồ Hoàn Kiếm; POI012 Lotte Hotel Hanoi; POI027 Sân bay Nội Bài | None |
| SYN072 | Planning Assistance | 100% | PASS | POI029 Anantara Hội An Resort; POI064 Điểm check-in Panorama Hội An 64; POI057 Công viên Xanh Hội An 57; POI055 Cafe Mộc Hội An 55 | None |
| SYN073 | Planning Assistance | 100% | PASS | POI067 Bệnh viện Minh Tâm Nha Trang 67; POI042 ATM BIDV Nha Trang 42; POI077 Điểm check-in Panorama Nha Trang 77; POI045 Khách sạn Sao Việt Nha Trang 45 | None |
| SYN074 | Planning Assistance | 100% | PASS | POI002 Highlands Coffee Nguyễn Huệ; POI004 Pizza 4P's Hai Bà Trưng; POI001 The Workshop Coffee | None |
| SYN075 | Conversational Search | 100% | PASS | POI001 The Workshop Coffee; POI002 Highlands Coffee Nguyễn Huệ; POI017 Trung Nguyên Legend Café Lý Tự Trọng | None |
| SYN076 | Conversational Search | 100% | PASS | POI004 Pizza 4P's Hai Bà Trưng; POI021 Nhà hàng Secret Garden | None |
| SYN077 | Conversational Search | 100% | PASS | POI013 Khách sạn Sala Đà Nẵng Beach; POI009 Galaxy Hotel Đà Nẵng; POI049 Khách sạn Sao Việt Đà Nẵng 49 | None |
| SYN078 | Conversational Search | 100% | PASS | POI001 The Workshop Coffee; POI017 Trung Nguyên Legend Café Lý Tự Trọng; POI022 Đường sách Nguyễn Văn Bình | None |
| SYN079 | Conversational Search | 100% | PASS | POI018 Phở Thìn Lò Đúc; POI019 Bún Chả Hương Liên; POI030 Hồ Hoàn Kiếm | None |
| SYN080 | Conversational Search | 100% | PASS | POI019 Bún Chả Hương Liên; POI018 Phở Thìn Lò Đúc; POI030 Hồ Hoàn Kiếm | None |
| SYN081 | Conversational Search | 100% | PASS | POI047 Khu vui chơi KidZone Đà Nẵng 47; POI038 Khu vui chơi KidZone Đà Nẵng 38; POI059 Khu vui chơi KidZone Đà Nẵng 59 | None |
| SYN082 | Conversational Search | 100% | PASS | POI034 Khách sạn Sao Việt Hà Nội 34; POI012 Lotte Hotel Hanoi; POI040 Khách sạn Sao Việt Hà Nội 40 | None |

## Trace Failure Summary

No failed trace layers.

## Grounding Rules and Dataset Limitations

1. **Explicit venue types are hard filters.** When the user names a category (quán cà phê, nhà hàng, khách sạn…), `handleChat` sets `hardCategory`, so lakes, parks, airports, or play areas can no longer leak into a café/restaurant request. Vibe phrases (hẹn hò, trẻ em, du lịch) stay soft to preserve broad discovery, and planning/journey requests keep a cross-category pool.
2. **City and district compose.** “Đống Đa, Hà Nội” requires the city to match; a district mention alone requires the district together with its canonical city. A Đà Nẵng venue whose synthetic district is also named Đống Đa no longer qualifies (S007).
3. **“Gần <named place>” is an anchor, not a result.** The named POI supplies the search center and a 5km radius; it is excluded from recommendations and stripped from category inference, so a food request near an airport cannot recommend the airport (S008) and “gần Hồ Hoàn Kiếm” means real proximity to the lake (S001).
4. **Numeric budgets persist.** `constraintsFor` extracts “dưới 500k”, “dưới 500.000”, and “khoảng một triệu” into `sessionContext.constraints` alongside qualitative constraints (S004).
5. **Honest no-match beats fabrication.** If no POI satisfies the hard constraints, the reply names the unmet category/anchor/attribute instead of relaxing them. Known coverage gaps in the supplied dataset: no restaurant near Tân Sơn Nhất/Tân Bình is marked late-night (S008 passes via the disclosed gap), and no Hà Nội café carries an explicit học nhóm/giá hợp lý tag (S007 accepts work-friendly café evidence instead).

## Failed and Partial Trace Analysis

All scenarios passed.

## Scoring Contract

Each scenario is scored against its workbook answer key across intent/map action, category, location, attributes or semantic behavior, and multi-turn/profile context. PASS requires every criterion to pass; PARTIAL means at least 50 weighted points; below 50 is FAIL. The JSON trace artifact contains every recommendation, score breakdown, session context, map action, and individual criterion result.
