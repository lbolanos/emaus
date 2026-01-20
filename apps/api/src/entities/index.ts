// Import all entities to ensure TypeORM discovers them
import './user.entity';
import './userProfile.entity';
import './friend.entity';
import './follow.entity';
import './userActivity.entity';
import './testimonial.entity';

// Re-export for convenience
export { User } from './user.entity';
export { UserProfile } from './userProfile.entity';
export { Friend } from './friend.entity';
export { Follow } from './follow.entity';
export { UserActivity } from './userActivity.entity';
export { Testimonial, TestimonialVisibility } from './testimonial.entity';
