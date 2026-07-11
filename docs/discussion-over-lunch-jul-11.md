## Action Items
- Edward to draft a one‑page pitch positioning the camera‑first mini‑app as a revenue engine for TASCO.  
- Build a prototype demo: camera‑based venue assistant (choose one location, implement 3–4 query types).  
- Define a user incentive scheme (vouchers, free items) to drive check‑ins and camera usage.  
- List required data sets: POI metadata, live crowding, entrance/parking visuals, seating estimates.  
- Prepare a short demo script that shows the loop: utility → usage → visual data → better map → monetisation.  
- Reach out to the Haskell team for possible collaboration on vision models and data pipelines.  

## Business Context & Goals
- TASCO’s core businesses: car sales/showrooms and the VETC toll‑payment gateway covering ~80‑90% of Vietnam toll gates.  
- Current toll‑wallet is low‑frequency; the aim is to evolve into a high‑frequency super‑app.  
- Desired new revenue streams: parking, fuel, insurance, roadside assistance, food, travel, and other services.  
- Need to boost screen time (currently 1‑2 min) and daily active users (≈120 k of 3 M subscribers).  

## Revenue & Monetisation Ideas
- Transform the toll wallet into a platform for cross‑selling higher‑margin services.  
- Offer sponsored placements and lead‑gen for restaurants, malls, dealers, parking/charging stations.  
- Earn transaction take‑rates on bookings, vouchers, parking fees, and other services.  
- Monetise the unique visual/location data for targeted ads and improved map accuracy.  
- Leverage existing 100 k+ daily active users to lower CAC and improve retention.  

## Data Strategy & Incentives
- Core data to collect: POI details, live crowd levels, entrance/exit points, washroom locations, seating capacity.  
- Camera footage from users provides exclusive visual data not available to competitors.  
- Incentivise contributions with vouchers, free meals (e.g., KFC), or gamified rewards similar to Pokémon Go.  
- Ensure the assistant responds quickly with a human‑like tone to boost engagement.  
- Partner with vendors who will pay for data‑driven advertising slots and promotions.  

## Demo Concept
- Prototype “camera‑first venue assistant” inside the VETC mini‑app.  
- User points phone camera at a mall/food‑court; app identifies venue and shows:  
  - Best nearby restaurant (e.g., sushi)  
  - Current crowd level  
  - Nearest entrance, washroom, parking spot  
- Allow quick check‑in/photo upload to generate live data for the map.  
- Use a fake backend if needed; focus on onboarding, camera UI, and one wow moment.  
- Demonstrate the loop: utility → usage → visual data → improved map → revenue opportunities.  

## Technical Considerations
- Need a vision model to recognise storefronts, signage, and estimate seating capacity.  
- GPU rental is feasible; main challenge is acquiring high‑quality training data.  
- Haskell team has stronger AI expertise – consider a partnership for model development.  
- Data linkage (matching camera image to X‑Y coordinates) currently yields ~30% accuracy as a baseline.  

## Open Questions / Risks
- Legal compliance for data collection and potential scraping of third‑party content.  
- Hardware compatibility of user phones for reliable camera capture.  
- Differentiation from Google Maps – must provide richer, real‑time contextual info.  
- Scaling the incentive program without incurring excessive cost.

[0:01] Me: I'm sorry.
[0:02] Me: If you can call it, you can buy stuff around. Yeah, I suppose. I don't need to buy any of these. I can buy stuff from outside. I can buy stuff from outside. I can buy stuff from outside. This is what people eat every day.
[0:22] Me: I don't know. What? What? What? I don't have a country. What? What? I don't know. I forgot about some friends. I forgot about some friends. I forgot about some friends.
[0:39] Me: There's a pantry. It's like a place where you can bring your own food and you eat there. Not as big as this, it's like a corner. It's like a lunch room. It's not a lunch room. But the corner of me is like a corner. It's not a pantry room.
[0:59] Me: But what the hell are people going to eat if there's no lunchroom? People eat outside. They just have to go outside. Or they eat at their spot. That concept is very foreign to me. I always have a lunchroom where I work. I worked at Costco before, and there's a lunchroom.
[1:20] Me: You can actually eat there. Yeah, because they sell snacks and shit in there. It's like vending machines. But most of the time, people just put their stuff in their fridge. That's like a company fridge that's very big and wide. And you come there, you put your food in there, you go work. When it's lunchtime, you come and you take your food to eat.
[1:40] Me: and come back to work. That kind of thing. The lunch corner is really true. We've got that. When you say the pantry, you mean the snack corner. Oh, yeah. The company that I work at, they have a snack corner too. And it's free.
[2:00] Me: I was going around talking to people earlier and turns out two other people at VNB are also at the conference.
[2:13] Me: Come on, come on.
[2:19] Me: Yeah.
[2:21] Me: Today, I'm going to shoot a doctor.
[2:26] Me: Thank you.
[2:28] Me: Oh, the house is cool!
[2:32] Me: This is Galaxy Folding. I asked you before.
[2:41] Me: Maybe someone's gonna be in the canteen until I go to the restaurant.
[2:49] Me: Okay, bye bye.
[2:54] Me: I didn't even know. Okay, clearly he's still listening, guys. So, what do you say? Like the VTC app, they had 3 million subscribers, but only 120K daily active users with the average time daily on the app is like 1 to 2 minutes. What does the app do?
[3:14] Me: Yeah, what does it do?
[3:18] Me: Costco
[3:21] Me: They hold the monopolies, they're the only one who provides the ultimate.
[3:29] Me: Every day in the morning
[3:32] Me: You do.
[3:33] Me: The blockage on the road, the type of pay
[3:39] Me: Let's go...
[3:40] Me: 80% of the food
[3:44] Me: We can go shopping together. Yes, go to the coast and the coast. What? It's not state owned? No. What? There are retail owners. Oh no. Wow, very capitalistic. This is the food. The food is the food.
[4:04] Me: So, people want to go to the account, they can get the money. Can you speak in English? Because I don't think they're transcribing Vietnamese very well. Oh, alright. Let me search for...
[4:23] Me: Chạm Thu Phí is like, how do you say Chạm Thu Phí in English?
[4:31] Me: Like fare again. The toll. The toll on the highway. Yeah, like where they stop your fucking car and they say, hey, give me your money and then they let you go. Yeah. So in the past, the tolls, the fee is manual. They give the bills, the money, the cash.
[4:51] Me: They let you pass, but currently it's automated. So the payment gate for that automated toll fees pay through the two vendors, two major vendors, VETC and Vettel, Vettel Digital Toys.
[5:11] Me: and VATC hold 80%, 50%, the rest 50% is retail and the 5% is the salaris of all the vendors. So the problem is VATC acts to deposit money. They have to go to VATC.
[5:31] Me: and I'm a CTI.
[5:34] Me: And if the app is just for payments, it will be replaced very soon. So they want to scale up the app into a super app for everything. To increase the screen time of its users.
[5:54] Me: one to two minutes only five to ten minutes the app what kind of services does it provide it's good i mean the interface
[6:14] Me: Does it have the user engagement or any incentive for the user to speak?
[6:28] Me: it's just an app where you can deposit my name and you can save it together
[6:35] Me: So you can open it up.
[6:47] Me: I mean
[6:49] Me: They must be fucking rich. Hashtag all of them. Yeah, they must be rich because they're handing out 500,000 USD. They're literally just handing out everything in hackathon. Yeah, and it's a lot of money. In Vietnam, it's serious money. It's serious money. Yeah, if you get into YC, they give you half a million, right? This is the same as YC.
[7:09] Me: the hell is he doing? Frozen NPC. No, dude. Your task of office at the Konex. That was so nice. The office? Yeah. During the Konex the week? Yes. The design is
[7:29] Me: very good. Okay. But the function is not bad. The function is deposit money. So when you go through the toll, it lets you go. Yeah. And then, um, so you're not in here.
[7:50] Me: You put in the money here and then you scan it. Yeah, yeah. The phone just scan it. And the law requirement was you need money. You go through the automated gate without the money, the police
[8:10] Me: I'm gonna call you in. Damn it. I don't know. I'm gonna have some connection. I'm gonna have some connection.
[8:19] Me: Yes.
[8:20] Me: So here's his order.
[8:24] Me: they tried to act in soft, in real
[8:29] Me: Thank you.
[8:32] Me: and the mode
[8:35] Me: from future of the future by insurance and medical school.
[8:43] Me: Emergency.
[8:48] Me: That's the bigger thing.
[8:54] Me: That's it. There's a miniature portrait here. Can you search the name of the Tesco founder?
[9:04] Me: Who is the fucking West Whisperflow nigga? Yeah, I'm rich. He's got the whole stack. Bro, bro, Tandy treats you well. No, it's BLI. It's my other company at Vancouver. Anyways, um...
[9:25] Me: The Chinese fish is actually very stingy with their money.
[9:28] Me: Yeah, to be a kind of singer. I think, anyway, so who is the founder of TASCO?
[9:36] Me: Okay, they got it wrong.
[9:41] Me: Wait, it's on the floor. No, it's... I got... I got... That's Hasco JSC. Oh, what? No, that's a Sport Optics. Vietnam. H-U-T.
[9:55] Me: Take those.
[9:59] Me: We said to drink. Do they say? Go!
[10:16] Me: What are you doing? How? What's the name? What's the name? What's the name? That's right.
[10:26] Me: Okay, anyway, so... Because of background. So basically, clearly, you didn't get the rest, but it was showing us a freaking app of Taxco. It's called VETC. And it's basically a freaking payment app. You need to get your money in your wallet. And when you're going through the fair gate... Background.
[10:47] Me: They're gonna basically deduct your money from the wallet automatically. And if you don't have any money there, the police are gonna fucking chase you down.
[10:57] Me: So TASCO now currently owns like 80 to 90% of all the fair gates in Vietnam.
[11:04] Me: But they want to scale this shit to a super app because if all they do is a payment, they're gonna be replaced very very soon.
[11:14] Me: Anything that I missed? No, no, I think that's good. Okay.
[11:20] Me: So I need like 3 of these to be full man. Actually the replacement is not a very concern. It's not a too much concern. What's the name of the Humes anyway? Yeah, I know I'm sorry.
[11:35] Me: Yeah so basically they just want to be ahead. They don't. Yeah they want to scale. Another income stream. Another country. Income stream. Stream of income. Income stream. Yeah. A growth driver or non growth driver.
[11:56] Me: and a bowl of pho here, 70,000 that smells delicious though you can probably get another one let me see if I can get one
[12:14] Me: This is the restaurant.
[12:35] Me: Nice to meet you.
[12:43] Me: Okay.
[12:44] Me: This is a good one.
[12:53] Me: anyone wants to see the end of the second cell dance? um, it's just a 5-0 should we go back and start looking at it? in the FDC, yes? where we got it?
[13:04] Me: Wait, it's trash.
[13:13] Me: It's nice to see you in the middle of the middle.
[13:19] Me: I think that's really good to be.
[13:40] Me: Do they reinforce each other? Better SuperApps is better than Math? Is that true? Maybe more schematic? Do we actually get schematic? Do we? If we need to help them, we need to have better Maths. We need to have better Maths. Maths are better.
[14:01] Me: If you are in the city of Hồ Chí Minh or in the city of Hồ Chí Minh, you can see the amount of money that you can buy. You can buy a lot of money, so you can buy a lot of money.
[14:22] Me: Is this data from the map? Yeah. No, I think he just hit something really cool.
[14:30] Me: Yeah, yeah, tell me about it.
[14:35] Me: No, here's the thing. The app wants to scale to more users, more functionalities, and the map wants to scale in terms of schematics and basically more metadata. What about we just combine both? Yeah, there's synergy. There's more people using the mini app,
[14:55] Me: more people repeat the data to the map too. And more people using the map, more people using the Super App.
[15:03] Me: That's hella right. That's hella right. So the point is to make... To make what? This is like an initial idea.
[15:14] Me: I think I saw examples of that to be honest like Chinese app right they just make an everything app. Really? Yeah they just make everything. WeChat, yeah.
[15:28] Me: And then the amount of data people let them have is crazy.
[15:34] Me: And then they just use that data to make it better. You said that the first guy is a little closer, got the motivator, optimized it and exit with 60 billion.
[15:48] Me: I think XAI will suck, right? Like CROC before Cursor, it sucks really bad. But after Cursor, they have the data, they released CROC 4.5. It's close to state of the art because of the data that people fed Cursor. So, data is like literally the boat right now.
[16:09] Me: So the boys...
[16:12] Me: Yeah, that guy, that Indian guy who gave a talk, AWS, that's San Francisco guy. So, I mean...
[16:21] Me: Think about it.
[16:22] Me: If you have all the data in the world and say training is pretty much
[16:29] Me: on the same level now. You can just like papers releasing every day, right? So,
[16:35] Me: The model is the data. The model is the data. The recipe is the same. It's just you scale data and then you scale like chips. That's it. If you have more data and you have more compute, your models will get better. That's it. Like the architecture.
[16:55] Me: It's irrelevant. The problem with, yeah, the problem with, with, with, with, with, with, with, with for tactical, they didn't have enough data. The problem was the, the apps for tactical, they didn't have enough users. That's a process, they synergize it. More users, they have more data.
[17:16] Me: More digital format, more user format. Mini-app? Yeah, that's a concept. And I think they... Because we don't have the technical level or the same level. Or the lower level of AESA. That's really...
[17:37] Me: I think they will change the world. Nice job.
[17:43] Me: I'm going to eat some bread and some bread.
[17:54] Me: I think it's a good one.
[18:23] Me: Thank you.
[18:25] Me: So first, you need infrastructure, right? But you can rent a GPU for training. That's not a big problem, right? But the second is you need data, good data.
[18:39] Me: We all know there's a restaurant that exists here, but we don't know if it's crowded on a 3pm on a Tuesday.
[18:48] Me: We don't know what kind of dish they serve as of latest. So, for example, you know there's a building that exists in Khu Công Ngae Cao, in Hitech Park, but you don't know
[19:06] Me: Where's the washroom for example on the first floor like if you at the entrance, where do you go? So like if we do case study is Pokemon go true
[19:19] Me: They harvested like thousands and millions of user camera footage. And now they use all of that to train the robots to delivery.
[19:31] Me: Yeah, for delivery. And I think they are at billions of dollars of valuation now. That robot delivery company. So if we can get the users to feed us their data, their camera data,
[19:45] Me: Damn bro, it's a long game but it's a good game. It's a good game. If we can sell them that vision then... Oh shit. But we can... Like, having a vision is one thing. Yeah. But being able to execute on it is another.
[20:01] Me: You need good engineers on it. Very true, true. And we are not just like we are not
[20:08] Me: The people at Haskell are much more technical than us. But if we pitch them the idea, I think the camera thing is cool. How can we get the vision data from the videos?
[20:25] Me: Yeah
[20:27] Me: and that's what we can cross-selling Tasco or other mini-apps.
[20:34] Me: People sharing sizing places, people sharing landmarks, where they go. So that's like a travel guide, a travel master cookbook.
[20:48] Me: and random in every single person The best thing about it is we already have a user base, right? So it's not like we are acquiring users from scratch but it's rather we have 100,000 daily active users How do we get even 5% of them using the mini app and point their camera at random places on a Tuesday?
[21:09] Me: and saying hey this restaurant is freaking crowded
[21:13] Me: right now but last time I went I don't know like last Sunday It's freaking like a ghost town, right for example. So those are the golden data that nobody can Nobody in the world has Nobody has right people talk about it on TikTok videos I guess but
[21:34] Me: It's not like our data. If we can collect data, it's golden. Yeah. And that's easy to demode.
[21:48] Me: We are talking. See you again.
[21:55] Me: Oh, thank you, bro. Five, five, six. Don't go to the end. Oh, did you guys get a new idea? This is too tight.
[22:04] Me: I'm thinking of the gap, but...
[22:06] Me: What's been happening?
[22:08] Me: So, talk about a use case of a Pokemon Go. Huh? Like, you know, you point a camera, you catch Pokemon, right? So, the thing is, they use that data to train delivery robots. And now that... They do? Yes. And they ask for it. And now that delivery robot company is at billions of valuations.
[22:29] Me: What's your name? I forgot the name, bro. I was just getting a general idea. You make people want to feed you their data.
[22:39] Me: use that data to train whatever like make make make the mini app better make the tour guide better make them lock in into the task of ecosystem
[22:49] Me: Right, like
[22:51] Me: It's gonna take the job of freaking tour guys away because at some point, the AI is gonna know better that this building has this sushi restaurant that people come there all the time at 3pm soon. But it's really good. So if you want to have good sushi, maybe go earlier in the day or some shit.
[23:12] Me: Or if you are at this building right here and you want to go to the washroom, just go straight and turn around. Like, don't sound it. The end goal is the use case. We're creating use case for the mini apps. Just like you said, 120.
[23:28] Me: Yeah, 20K.
[23:31] Me: active user daily with only 22 minutes of screen time. When the scale
[23:39] Me: All
[23:40] Me: Yeah, I think of new use case for them just to just open the app, just to fit the data. And you know what? You know why Grab has city location tracking? Like when you go to the Mesa for example, like the Vy động or any landmark.
[23:59] Me: since the merging of provinces and shit. They become very inaccurate.
[24:04] Me: But how can they not fix that? They have a team of engineers. It's because they don't have the actual camera.
[24:11] Me: They can't actually see the shit.
[24:15] Me: Because the Grab drivers, right, they only have the XY location on the map, but they cannot physically see, like, they don't enable the camera.
[24:26] Me: I can't enable the camera. So if we can get the users to enable the camera, that could be. How does the camera help with the navigation exactly? Oh, the camera will help with navigation? Yeah. How does it help with the navigation exactly?
[24:39] Me: We're gonna match the image
[24:42] Me: the x-y coordinate and we say if this thing may send insight
[24:46] Me: then that's XY coordinate. It's a match, it's a match. That's a 30%.
[24:54] Me: The linkage, the data linkage is another guy's problem. But they actually have the data.
[25:02] Me: And yeah, I know
[25:05] Me: Like you said, the longitude and latitude are already there. They are extra places. And look at the Deyemaysan size. And it's similar to the guys last few years, going on the same road seeing the Deyemaysan size. So they can mapping it better.
[25:24] Me: But that is another use case of the data we collect. But I would say whoever holds the most data wins. Yeah, and creating the incentive for users to willingly share the data.
[25:41] Me: I think that every single car, every single passenger car, they have a camera to record the roads for any incident, for any problems. That would be hard. That would be hard to collect from though because...
[25:59] Me: I don't think the hardware is even compatible in the first place.
[26:03] Me: No, no, no, we're just selling them the ideas. Because I believe the guys who do the Vietnam system with the camera, with the navigation, because they have a single detection for each police car on the road.
[26:24] Me: We have police guards at the service network. Okay, wait one second though. We've been talking a lot about collecting data and shit, right? But like, how can this make TASCO more money? Because that's what they care more about, right?
[26:39] Me: First, they have to talk. Do you have any ideas? No, no, no. I think the problem with data is very important. But how are we supposed to demo it? That's not the, like, whatever we have, we want, we just have to.
[26:56] Me: We just need to think of like, how do we demo it?
[26:59] Me: So two questions, right? How they have Taxco cut costs, increase revenues. How we can get more to Taxco? It's called by... It's called increased revenues by increased revenue because they can scale the app better, reach more,
[27:17] Me: So this is getting more data, right? Getting more users. First is how we have Haskell increase their revenues by increasing the stream time. Yo, clearly has the answer. Oh, damn. All right, let's see if it's actually good. So increase revenue by low.
[27:37] Me: turning low frequency to a high frequency super app, cross to a higher margin service,
[27:44] Me: make sense to our CAC because they already have users and payment drills
[27:49] Me: Improve retention, reduce churn.
[27:54] Me: monetize data indirectly through better targeting, better mapping, partnership. We can like, if you pay me, I recommend your restaurant where people are trying to find a freaking place to eat. That's just the use case for both partnership and consumer. How do we demo it? Build one very concrete app use case.
[28:15] Me: Yeah, yeah, yeah.
[28:19] Me: I think I can hit one more.
[28:23] Me: low frequency toll wallet into a high frequency what the hell? Oh a toll wallet okay cross sell
[28:32] Me: Trust so high-gumorgin services, work and food.
[28:39] Me: You want more?
[29:11] Me: shows you some live information kind of now
[29:15] Me: Why would someone want to use this? You don't have to come out of place. I'm looking for a Gemini. It's similar to our... Gemini would have a lot more knowledge about that specific place. For example, if you're new to the place, if you're new to the building, you just have to go.
[29:35] Me: traveling to Landmark 81, for example, right? You don't know what to expect. You don't know which one is the best restaurant to go.
[29:44] Me: It can help you. It can help you. Oh, this sushi restaurant is very good on the top floor.
[29:50] Me: And it's actually very fun right now. There's not a lot of people there right now, so it's the best time to go. More utility, more usage. That kind of is hard, but I think with more camera, we also get more information and that can definitely be
[30:05] Me: The thing is make it ask. Make users want to talk to that agent. Can you get two for me? I can't get two for me. I asked for you too. I asked for you too and they don't let it.
[30:26] Me: Okay, okay.
[31:06] Me: Thank you.
[31:38] Me: Lowkey, I don't know why they even have a Vietnam team to begin with. But I think it's cheap labor. Are you in the US? I need fish.
[31:52] Me: I'm going to go.
[31:54] Me: Yeah. Wait, why is chicken? Yeah. And why does that chicken look so different? Yeah, it looks the same as I did. Like the first one is, I think they two different kinds. There's two different dishes. But anyway, so we're not pitching a mad comedy. We are pitching a comedy.
[32:14] Me: revenue engine on top of tactical existing user base that sounds like fucking clearly with taylor for interview bro bro bro is a go-go i'm looking for like some open source to fully but it's like they're not you pay for this
[32:34] Me: Yes, like 20 bucks a month. But my company pays for it, no? Oh! This actually though...
[32:49] Me: Yeah, this is a different dish.
[32:56] Me: Thank you.
[33:03] Me: Yo, you can put it here. Oh, thank you. Oh, okay.
[33:12] Me: So what I didn't miss? Like what is the full page? Okay, so how do we incentivize people to use? Okay, so the way we make people want to talk to the agent is first make it very fast.
[33:26] Me: And second, tonality must be right. Okay, like it must feel like they talking to a real person. Okay, so to do that and also it has to be actually useful. Okay, so that's first fast tonality and useful. How do we pay people?
[33:46] Me: How about we pay people? Each destination. Payment is expensive because we partner with the vendors to get the data from them. Because more people come to a place, more attraction to the place for the vendors and more
[34:06] Me: So actually the vendor, the partnership is the one who paid for
[34:13] Me: us to advertise their platform on one point on what three four by three trillion subscribe we need to see subscribers
[34:25] Me: So
[34:27] Me: From what I understand, we have some partnership. For example, with KFC. People would come to KFC to do the thing. But the thing is that if we do that, we would have like a million data points on KFC, but like zero on everything else.
[34:47] Me: Yeah, that's the point. The incentive is just for promotion, for creating the user behavior.
[35:07] Me: those are they use one to break the eyes
[35:16] Me: pay for the switching costs for the user to aside from sharing on Facebook because our competitor is Facebook, TikTok, real YouTube. Loki, can we just scrape the shit out of them? Can we just like transcribe all of those TikTok videos?
[35:36] Me: But that's illegal though. That is illegal. Yeah, just like I said, that's illegal. But if we pay someone who watches and then recording the data from it,
[35:47] Me: It's very cheap.
[35:49] Me: To what?
[35:51] Me: But that's just another story.
[35:55] Me: But I like the point in the camera and like...
[36:01] Me: your camera sees everything and whatever the fuck though.
[36:06] Me: Like earlier, it says, what is it? One very concerned camera-based location in Taos.
[36:17] Me: Yeah, him.
[36:18] Me: App identifies menu, entrance and landmark. Shows useful live information.
[36:29] Me: You can submit a quick check in and photo. I don't think anyone would submit a quick check in and photo. That's just the thing like Tokyo, I get like if you were to come to KFC because you get a free KFC. The only reason why you would come to KFC to do a check in is because you get a free check in. That's it. You would not do it again.
[36:50] Me: for anything else. If I say, oh, if you come to this place to check in, if you have a task to check in, and then we give you a voucher for a free chicken, then you will do it. So that's what I meant by incentive. Like, people aren't going to pick up their phone.
[37:07] Me: It's either had to be fun or they have to get some kind of energy. Pokemon Go was fun.
[37:13] Me: In San Diego it's like vouchers and money and what the fuck. If you can. Okay, how about making the tactical map the most accurate map for Vietnam. Yeah. And that could be the most. Because I don't know.
[37:32] Me: So that loops back to the question, what does Tasco actually do in the first place?
[37:39] Me: I don't even know, to be honest. They have a very successful business. Their business is growing and they want another growth driver, another thing to diversify their revenue stream. But what is their business? Their business?
[37:59] Me: The core business is that they sell cars. They sell cars. They have showrooms. They sell cars as a middleman. They create a showroom, import the car, and that requires a lot of certificates and connection between the government.
[38:20] Me: That's the mode. The connections. And they successfully grow the second growth driver. It's the VATC, the toll payment gateway. That is the second growth driver.
[38:40] Me: the second revenue stream and currently they want to scale that revenue stream diversify not just not just hold but all the use case and they have successful with emergency service like the guy
[39:00] Me: They have 300 trucks to drive the car for emergency service along Vietnam. So, they're looking for another revenue driver, revenue free.
[39:20] Me: I'm going to go.
[39:25] Me: I was just going to go to the restaurant
[39:27] Me: the things that we talked about are outside the scope of the tracks that they have. Is that even legal? I mean, look, the track is there because that's the best that they know. That's the problem. They don't know everything.
[39:47] Me: I know better than you and let me show you and they'll be like oh shit so you're smart as fuck let me give you 200k plus equity and that's actually what they're looking for they're looking for the guys who who have the idea and willing to do that's what i get because the guy i talked to two guys
[40:08] Me: And two of them is the last track winner of the Lotus hat.
[40:17] Me: They say we win because they bring the best idea, the best concept.
[40:26] Me: we don't replace their whole engineer team if we saw they already had the team that solved the math problem you already have the team to develop the mini-air feature how can we squeeze in
[40:42] Me: Mmmm
[40:49] Me: I need to think. Yeah, that's a picture. We need to think, bro. We need to think, bro. We need to think, bro. We need to think. Okay, okay, yeah. Divide 74, that's like 800 triệu con người, bro.
[41:02] Me: Bye!
[41:04] Me: That's not enough to buy a house though. You want to buy a house? I don't think they dispute all the equity, all the money as one. They give us like 100 bucks for the juvenile speech and the corner speech. I think the 100k is for building the company, not to pay us. Yeah.
[41:24] Me: They bring us 5K. And then if I buy 3, that's like 1.5K. Is that another buy house? A Lego house. OK, so.
[41:38] Me: So I think we've been talking about that right and the mode so we agree that the data is literally the mode right now Just hold the freaking data first then with the raw freaking data we can do whatever we want with it Like the user don't care about privacy
[41:59] Me: No matter how much they want, they claim they do. But if you can open your phone with your face, oh yeah, that's good enough. I don't care.
[42:08] Me: If you can
[42:11] Me: If you can have one click login, yeah that's right. If they can give you the best advertisement based on your interest, yeah I love it.
[42:20] Me: So
[42:22] Me: So again like
[42:25] Me: From the business perspective, how does this help Tesco make more money?
[42:31] Me: what cross-sell or hub-sell are we gonna actually do? Because holding the data is actually cool, but what do we do with it is also a very valid question. Yeah, I think we have to make that very explicit about how the data is gonna benefit. Bring on the map. The map. Like, how is the map gonna make
[42:51] Me: and then from that, what kind of data do we need to supply the demand? Cluey! Answer this question.
[42:58] Me: what that's crazy you just added high dog with the pushers
[43:11] Me: I thought clearly it's like... It's the only favorite though. I mean... I mean we...
[43:18] Me: yeah read it really can you read it for me how does the map make task of money sponsored placement for restaurant lead gen
[43:30] Me: Car lead generation for Tesco business.
[43:34] Me: What? Like, they list the traffic to Tesco if they want to buy a car. That's not a buyer. What the fuck?
[43:41] Me: For internal, this is all external. Transaction, take a break.
[43:47] Me: Oh! Cross-sell. Oh, if they want to expand to more use games. No! Wait, what? No. No, expand to more use games. No, cost of navigation, pick up more entrances, and service routing are more accurate. Better con... Wait, so earlier you... Oh! What did you do that about? Okay, what demand?
[44:07] Me: And then we're serving. We're the part.
[44:11] Me: Driver wants to know where to park, where to charge, where to enter, where traffic is.
[44:16] Me: That's valid. That's valid. What to eat, what is spotted now by sighthands. But they can just do that with Google Maps.
[44:26] Me: All you have with Google Maps is a freaking heat map of where things are very
[44:33] Me: Like for example, I will, I don't know, landmark 81.
[44:38] Me: Bye.
[44:39] Me: 81, hold on. They measure it by the device using Google services. That's quite wild.
[44:47] Me: Like, you know, they often have like the crowded hours, right? Yeah. But that's all they have. It depends on like whether Google ask them a question like, is it very crowded right now? Yes, no, maybe.
[45:03] Me: But...
[45:05] Me: If we can get a virtual assistant like that, hey, it's pretty crowded right now. Are you sure you want to go there? That's a better alternative. True. And they would advise all the vendors around the area.
[45:21] Me: same service less I mean yeah that's what the the virtual guys oh yeah oh yeah
[45:41] Me: This is because what I observe from the... What do you need? They need charisma, they need concept, idea. Oh my god! Then we just fucking do with the tourist guide then. Yeah, then we start... Why are we talking about data?
[45:58] Me: So today's concept is about concept
[46:06] Me: Then
[46:08] Me: This is the demo day in TASCO if you want to do it. This is the actual work.
[46:15] Me: So I think Edward, I think it's suitable for the framework of Sikwin4. How is the framework?
[46:26] Me: We have data, what we're gonna do, what feature we're gonna get, a lot of features that we demo in.
[46:39] Me: If we got the price, if we get something from here, we will launch IPCXX.
[46:49] Me: Incentive, mini app, tool guide, visual, something, something, something.
[46:56] Me: More
[46:58] Me: I don't forget to use the framework, but I will align with the time frame for demo or photo. So like the 614Lab velocity is you don't build a MVP, but you build a prototype. The difference between the MVP and the prototype
[47:18] Me: MVP is called what? Minimal Viable Product, right? The prototype is not fucking viable. It's just something fake. You made a claw design and have a good onboarding flow that do one thing well and that's it. And that one thing you're doing, it can be fake too. It can be mobbed.
[47:38] Me: So
[47:39] Me: given the time that we have right now, like I don't think there's enough time to do any meaningful right pipeline. We don't have data to do that as well. I mean, we do have five data sets from TASCO, but that's just a fucking metadata bullshit. Like this restaurant is large.
[47:56] Me: They don't say seating though. They don't say any seating. But if we can get the users to point their fucking camera at the restaurant, we can use a vision model to calculate how many seatings that restaurant approximately have. Seatings? What do you mean seatings? Like 1, 2, 3, 5, just like 5, 6, 6. Yeah, we can just demo this by showing. Yeah, yeah.
[48:16] Me: In Beijing, I'm just a North Pole, holding around I met. So I see holding right now, we've been so far. That's a great moment.
[48:26] Me: Oh!
[48:29] Me: No, no, no, no no, I think they're strong, I'm strong, I think they're strong.
[48:35] Me: How does the camera fit into the idea? Is that just for the effect? The camera is literally the data nobody else has. If we can get users to want to point their camera for help, right? I see, I see.
[48:55] Me: I see you see you at a food court there's 25 vendors in there you point the camera hey I actually want some Italian food Where do I go? Oh see the right corner over there? Yeah, that's the one Mmm, I see I see what you mean and then you you gotta train the shit out of it like you gonna feed all that shit
[49:16] Me: to our model. We should not worry about the data. We should not worry about how they make the schema.
[49:25] Me: Just show them the both sides, the glimps of the end.
[49:33] Me: Let's do it then. Let's just lock it down and then pitch it to the mobile phones downstairs. And then... The thing is, if that's the case, we should finalize. Finalize what that looks like. I think there's still some differences in our vision of what the app looks like.
[49:54] Me: So let's just finalize that and then we go pitch, get some validation and then we start building.
[50:00] Me: Get an island building. Kisa's working for a tiny little bit.
[50:06] Me: take clue so what kind of app and show we will we need to finalize in this year
[50:12] Me: Okay, you want to read it?
[50:16] Me: who we can't read?
[50:18] Me: Sorry, I can't read. You paid 20 bucks and you don't even have like text or speech bro? Build a camera first, manual assistant inside.
[50:30] Me: Let's come out of mall food port.
[50:37] Me: I mean, camera is cool, but I was just thinking for practicality. To just say, oh, I'm at this mall right now. I think ChatGPT also aims to have a consumer app. It's a one-on-one assistant. The other time is... GPT Live? Yeah, yeah.
[50:57] Me: I was thinking something like that, but for maps.
[51:02] Me: Like that's what I was doing. What does GBD Live actually do? It's a voice model, but then it's more human. So it's like you and I, we're, I mean, let's just try it out.
[51:14] Me: I mean, we all have the QBD Pro, right? Yeah.
[51:25] Me: Why did you start going from your house?
[51:29] Me: Basically like it's more interactive. It can interrupt you, it can talk over you when you're saying something bullshit. It's just more like human. I think we should clean up and then we can keep talking.
[51:50] Me: Oh shit. Oh shit what? Oh shit.
[51:53] Me: Oh, just grab a new one.
[51:57] Me: At the entrance. Yeah, that makes sense.
[52:04] Me: Anyways, let's clean up guys. Damn! Tony told her we ate seven. You need two guys. I ate three. I didn't have breakfast though. But you know when you train, then somehow you just eat a lot more.
[52:24] Me: Thank you.
[52:31] Me: Still, I think he doesn't want to eat cơm.
[52:45] Me: so
[52:56] Me: Thank you.
[53:03] Me: Let's go to the portal.