# P8) Conversational AI Map Assistant

## Create Project

- [Create project link](https://aitalent.genaifund.ai/hackathon/my-projects?new=1&track=mobility)

## Platform Context

This challenge is built around Tasco Maps, Vietnam's next-generation digital map platform designed to help users discover places, businesses, services, and mobility experiences.

Tasco Maps aims to provide intelligent search, local discovery, recommendations, navigation, and location-based experiences tailored for Vietnamese users and businesses.

## Platform Resources

This challenge is built on top of the Tasco Maps ecosystem. Participants are encouraged to explore the Tasco Maps application and design solutions that enhance search, discovery, recommendations, AI experiences, and local content rather than replacing the underlying map platform.

Participants are encouraged to build solutions that are integration-ready with the Tasco Maps ecosystem.

## Objective

Build an AI-powered map assistant that enables users to interact with maps through natural language conversations.

Traditional map search requires users to enter keywords and manually refine searches. Modern users increasingly expect conversational experiences where they can ask questions, provide additional context, and receive intelligent recommendations through natural interactions.

The solution should help users discover places, services, and experiences through conversations rather than traditional keyword-based search.

## Core Capabilities

- Conversational Search: search using natural language conversations.
- Multi-turn Interactions: maintain context across multiple conversation turns.
- Clarification Questions: ask follow-up questions when information is missing or ambiguous.
- Voice Interaction: support voice-based interactions.
- Personalized Recommendations: recommend places based on user preferences and context.
- Context Understanding: understand conversation history and user intent.
- Map Action Generation: convert conversations into map search or navigation actions.

## Example User Scenarios

- Conversational search: user asks for a quiet coffee shop; assistant asks which area; user says near Hoan Kiem Lake; assistant returns quiet nearby coffee shops suitable for work or study.
- Clarification: user asks to go to Galaxy; assistant asks whether Galaxy Cinema, Galaxy Hotel, or Galaxy Shopping Center is intended.
- Personalized recommendation: user asks for a first-date place in Ho Chi Minh City; assistant recommends highly rated restaurants and rooftop cafes.
- Other scenarios include family restaurant search, tourist guidance, navigation, and trip planning.

## Expected Output

The system should generate natural conversational responses and map recommendations.

Example output should include:

- intent
- assistant response
- recommendations with reasons
- confidence score

## Expected Deliverables

- Conversational AI Assistant
- Conversation Engine
- Recommendation Engine
- Search & Map Integration
- Live demo of conversational experiences

## Submission Requirements

- Presentation deck
- Live demonstration or recorded video
- Source code repository
- README with solution overview, setup instructions, and technologies used
- At least 10 example conversations and assistant responses
- Explanation of how context and conversation history are managed
- Description of recommendation methodology and personalization approach

## Suggested Architecture

- User Interface: chat or voice interface
- Conversation Manager: context and session management
- Query Understanding Layer: intent and entity extraction
- Recommendation Engine: place and service recommendations
- Search Integration Layer: integration with map search
- LLM Layer: conversational AI generation
- Response Layer: natural language response generation

## Success Criteria

- Natural and helpful conversations
- Multi-turn interaction support
- Context awareness across conversations
- Ability to ask clarification questions when needed
- High-quality place recommendations
- Personalized user experiences
- Fast and intuitive interactions

## Provided Resources

- Search Query Dataset
- POI Dataset with places, businesses, categories, locations, brands, and attributes
- POI Metadata with ratings, popularity signals, descriptions, and tags
- User Preference Dataset with sample user profiles and preferences
