#import <Foundation/Foundation.h>

int main(void) {
  @autoreleasepool {
    NSString *classes = @"bg-primary hover:bg-primary focus:text-accent text-accent from-primary via-accent to-accent";
    NSLog(@"%@", classes);
  }
  return 0;
}
