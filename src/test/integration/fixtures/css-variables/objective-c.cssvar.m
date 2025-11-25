#import <Foundation/Foundation.h>

int main(void) {
  @autoreleasepool {
    NSString *css = @"color: var(--primary-color)";
    NSLog(@"%@", css);
  }
  return 0;
}
